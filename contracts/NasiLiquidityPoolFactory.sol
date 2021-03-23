// SPDX-License-Identifier: MIT
pragma solidity >=0.5.14;

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./NasiToken.sol";

interface IMigrator {
  /**
    * Perform LP token migration from legacy UniswapV2 to NasiSwap.
    * Take the current LP token address and return the new LP token address.
    * Migrator should have full access to the caller's LP token.
    * XXX Migrator must have allowance access to UniswapV2 LP tokens.
    * NasiSwap must mint EXACTLY the same amount of NasiSwap LP tokens or
    * else something bad will happen. Traditional UniswapV2 does not
    * do that so be careful!
    */
  function migrate(address token) external returns (address);
}


contract NasiLiquidityPoolFactory is Ownable {
  using Math for uint256;
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  /**
    * @param amountOfLpToken
    * @param rewardDebt
    */
  struct UserInfo {
    uint256 amountOfLpToken;
    uint256 rewardDebt;
  }

  struct PoolInfo {
    address lpTokenAddress;
    uint256 allocationPoint;
    uint256 lastRewardBlock;
    uint256 accumulatedNasiPerShare;
  }

  NasiToken public nasiToken;
  uint256 public nasiPerBlock;
  uint256 public endBlock;
  uint256 public endBlockWeek1;
  uint256 public endBlockWeek2;
  uint256 public endBlockWeek3;
  uint256 public endBlockWeek4;

  uint256 public poolCounter;
  address public migrator;
  address public devaddr;

  mapping (uint256 => PoolInfo) public poolInfo;
  mapping (uint256 => mapping (address => UserInfo)) public userInfo;

  uint256 public totalAllocationPoint;
  uint256 public startBlock;

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

  constructor(
    address _nasiAddress,
    address _devaddr,
    uint256 _nasiPerBlock,
    uint256 _startBlock
  ) public {
    nasiToken = NasiToken(_nasiAddress);
    devaddr = _devaddr;
    nasiPerBlock = _nasiPerBlock;
    startBlock = _startBlock;
    endBlockWeek1 = _startBlock.add(45500);
    endBlockWeek2 = endBlockWeek1.add(45500);
    endBlockWeek3 = endBlockWeek2.add(45500);
    endBlockWeek4 = endBlockWeek3.add(45500);
    endBlock = _startBlock.add(1137500);
  }

  /**
    * @notice Set the migrator contract. Can only be called by the owner.
    */
  function setMigrator(address _migrator) public onlyOwner {
    require(_migrator != address(0), 'Migrator can not equal address0');
    migrator = _migrator;
  }

  /**
    * @notice Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    */
  function migrate(uint256 _pid) public {
    require(address(migrator) != address(0), "migrate: no migrator");
    PoolInfo storage pool = poolInfo[_pid];
    IERC20 lpToken = IERC20(pool.lpTokenAddress);
    uint256 bal = lpToken.balanceOf(address(this));
    lpToken.safeApprove(address(migrator), bal);
    address newLpToken = IMigrator(migrator).migrate(pool.lpTokenAddress);
    require(bal == IERC20(newLpToken).balanceOf(address(this)), "migrate: bad");
    pool.lpTokenAddress = newLpToken;
  }

  /**
    * @notice Deposit LP tokens to Factory for nasi allocation.
    */
  function deposit(uint256 _pid, uint256 _amount) public {
    require(_pid <= poolCounter, 'Invalid pool id!');
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    updatePool(_pid);
    if (user.amountOfLpToken > 0) {
      uint256 pending = (user.amountOfLpToken.mul(pool.accumulatedNasiPerShare).sub(user.rewardDebt)).div(1e12);
      if(pending > 0) {
        _safeNasiTransfer(msg.sender, pending);
      }
    }
    IERC20(pool.lpTokenAddress).safeTransferFrom(address(msg.sender), address(this), _amount);
    user.amountOfLpToken = user.amountOfLpToken.add(_amount);
    user.rewardDebt = user.amountOfLpToken.mul(pool.accumulatedNasiPerShare);
    emit Deposit(msg.sender, _pid, _amount);
  }

  /**
    * @notice Add a new lp to the pool. Can only be called by the owner.
    */
  function addLpToken(uint256 _allocationPoint, address _lpTokenAddress, bool _withUpdate) public onlyOwner {
    if (_withUpdate) {
      massUpdatePools();
    }
    poolCounter++;
    uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
    totalAllocationPoint = totalAllocationPoint.add(_allocationPoint);

    poolInfo[poolCounter] = PoolInfo(
      _lpTokenAddress,
      _allocationPoint,
      lastRewardBlock,
      0
    );
  }

  function massUpdatePools() public {
    for (uint256 _pid = 1; _pid <= poolCounter; _pid++) {
      updatePool(_pid);
    }
  }

  /**
    * @notice Update reward variables of the given pool to be up-to-date.
    */
  function updatePool(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    if (block.number <= pool.lastRewardBlock) {
      return;
    }
    uint256 lpSupply = IERC20(pool.lpTokenAddress).balanceOf(address(this));
    if (lpSupply == 0) {
      pool.lastRewardBlock = block.number;
      return;
    }
    uint256 multiplier = getBonusMultiplier(pool.lastRewardBlock, block.number);
    uint256 nasiReward = multiplier.mul(nasiPerBlock).mul(pool.allocationPoint).div(totalAllocationPoint);
    nasiToken.mint(address(this), nasiReward);
    nasiToken.mint(devaddr, nasiReward.div(10));
    pool.accumulatedNasiPerShare = pool.accumulatedNasiPerShare.add(nasiReward.mul(1e12).div(lpSupply));
    pool.lastRewardBlock = block.number;
  }

  /**
    * @notice Get the bonus multiply ratio at the initial time.
    */
  function getBonusMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
    uint256 week1 = _from <= endBlockWeek1 && _to > startBlock ? (Math.min(_to, endBlockWeek1) - Math.max(_from, startBlock)).mul(16) : 0;
    uint256 week2 = _from <= endBlockWeek2 && _to > endBlockWeek1 ? (Math.min(_to, endBlockWeek2) - Math.max(_from, endBlockWeek1)).mul(8) : 0;
    uint256 week3 = _from <= endBlockWeek3 && _to > endBlockWeek2 ? (Math.min(_to, endBlockWeek3) - Math.max(_from, endBlockWeek2)).mul(4) : 0;
    uint256 week4 = _from <= endBlockWeek4 && _to > endBlockWeek3 ? (Math.min(_to, endBlockWeek4) - Math.max(_from, endBlockWeek3)).mul(2) : 0;
    uint256 end = _from <= endBlock && _to > endBlockWeek4 ? (Math.min(_to, endBlock) - Math.max(_from, endBlockWeek4)) : 0;

    return week1.add(week2).add(week3).add(week4).add(end);
  }

  function pendingNasi(uint256 _pid, address _user) external view returns (uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 accumulatedNasiPerShare = pool.accumulatedNasiPerShare;
    uint256 lpSupply = IERC20(pool.lpTokenAddress).balanceOf(address(this));
    if (lpSupply == 0) {
      return 0;
    }
    if (block.number > pool.lastRewardBlock && lpSupply != 0) {
      uint256 multiplierBonus = getBonusMultiplier(pool.lastRewardBlock, block.number);
      uint256 nasiReward = multiplierBonus.mul(nasiPerBlock).mul(pool.allocationPoint).div(totalAllocationPoint);
      accumulatedNasiPerShare = accumulatedNasiPerShare.add(nasiReward.mul(1e12).div(lpSupply));
    }
    return (user.amountOfLpToken.mul(accumulatedNasiPerShare).sub(user.rewardDebt).div(1e12));
  }

  /**
    * @notice Withdraw LP tokens from Factory
    */
  function withdraw(uint256 _pid, uint256 _amount) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    require(user.amountOfLpToken >= _amount, "Not enough funds!");
    updatePool(_pid);
    uint256 pending = (user.amountOfLpToken.mul(pool.accumulatedNasiPerShare).sub(user.rewardDebt)).div(1e12);
    _safeNasiTransfer(msg.sender, pending);
    user.amountOfLpToken = user.amountOfLpToken.sub(_amount);
    user.rewardDebt = user.amountOfLpToken.mul(pool.accumulatedNasiPerShare);
    IERC20(pool.lpTokenAddress).safeTransfer(address(msg.sender), _amount);
    emit Withdraw(msg.sender, _pid, _amount);
  }

  /**
   * @notice Withdraw without caring about rewards. EMERGENCY ONLY.
   */
  function emergencyWithdraw(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    uint256 amount = user.amountOfLpToken;
    user.amountOfLpToken = 0;
    user.rewardDebt = 0;
    IERC20(pool.lpTokenAddress).safeTransfer(address(msg.sender), amount);
    emit EmergencyWithdraw(msg.sender, _pid, amount);
  }


  // Update the given pool's NASI allocation point. Can only be called by the owner.
  function setAllocationPoint(uint256 _pid, uint256 _allocationPoint, bool _withUpdate) public onlyOwner {
    require(_pid <= poolCounter, 'Invalid pool id!');
    if (_withUpdate) {
      massUpdatePools();
    }
    totalAllocationPoint = totalAllocationPoint.sub(poolInfo[_pid].allocationPoint).add(_allocationPoint);
    poolInfo[_pid].allocationPoint = _allocationPoint;
  }


  function _safeNasiTransfer(address _to, uint256 _amount) internal {
    uint256 nasiBalance = nasiToken.balanceOf(address(this));
    if (_amount > nasiBalance) {
      nasiToken.transfer(_to, nasiBalance);
    } else {
      nasiToken.transfer(_to, _amount);
    }
  }

  function _safeNasiBurn(uint256 _amount) internal {
    uint256 nasiBalance = nasiToken.balanceOf(address(this));
    if (_amount > nasiBalance) {
      nasiToken.burn(nasiBalance);
    } else {
      nasiToken.burn(_amount);
    }
  }

  // Update dev address by the previous dev.
  function dev(address _devaddr) public {
    require(msg.sender == devaddr, "dev: wut?");
    devaddr = _devaddr;
  }
}