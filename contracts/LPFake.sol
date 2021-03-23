// SPDX-License-Identifier: MIT
pragma solidity >=0.5.14;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol";

/** Upgradeable ERC20 token that is Detailed, Mintable, Pausable */
contract LPFake is
  ERC20,
  ERC20Detailed,
  ERC20Mintable,
  ERC20Pausable
{
  address _managerContractAddress;
  string constant NAME = "USDT";
  string constant SYMBOL = "USDT";
  uint8 constant DECIMALS = 18;

  uint256 constant INITIAL_SUPPLY = 1000000 * 10**uint256(DECIMALS);

  constructor() public ERC20Detailed(NAME, SYMBOL, DECIMALS) {
    _mint(msg.sender, INITIAL_SUPPLY);
  }
}
