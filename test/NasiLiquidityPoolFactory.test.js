const truffleAssert = require('truffle-assertions');
const { BigNumber } = require('ethers');
const { expect } = require("chai");

describe("NasiLiquidityPoolFactory", function() {
  let owner;
  let acc1;
  let acc2;
  let acc3;
  let acc4;
  let token;
  let LPfake1;
  let LPfake2;
  let liquidityPoolFactory;
  const ether = BigNumber.from(10).pow(18);
  const milliether = BigNumber.from(10).pow(15);
  beforeEach(async () => {
    const NasiToken = await ethers.getContractFactory("NasiToken");
    const NasiLiquidityPoolFactory = await ethers.getContractFactory("NasiLiquidityPoolFactory");
    const LPFake = await ethers.getContractFactory("LPFake");
    [owner, acc1, acc2, acc3, acc4, acc5] = await ethers.getSigners();
    [
      token,
      LPfake1,
      LPfake2,
    ] = await Promise.all([
      NasiToken.deploy(),
      LPFake.connect(acc2).deploy(),
      LPFake.connect(acc3).deploy(),
    ]);

    liquidityPoolFactory = await NasiLiquidityPoolFactory.deploy(
      token.address,
      acc5.address,
      BigNumber.from(5).mul(ether),
      10
    );
    await token.connect(owner).addMinter(liquidityPoolFactory.address);
    await liquidityPoolFactory.connect(owner).addLpToken(
      10,
      LPfake1.address,
      false
    );
  });
  
  it("should add LP pool to factory not update Factory", async () => {
    const [
      totalAllocationPoint,
      poolCounter,
      poolInfo,
    ] = await Promise.all([
      liquidityPoolFactory.totalAllocationPoint(),
      liquidityPoolFactory.poolCounter(),
      liquidityPoolFactory.poolInfo(1),
    ])
    expect(totalAllocationPoint.toNumber()).to.equal(10);
    expect(poolCounter.toNumber()).to.equal(1);
    expect(poolInfo.allocationPoint.toNumber()).to.equal(10);
    expect(poolInfo.lpTokenAddress).to.equal(LPfake1.address);
  });

  it("should deposit LP to pool", async () => {
    const balanceLpOfAccount2Before = await LPfake1.balanceOf(acc2.address);
    expect(balanceLpOfAccount2Before, BigNumber.from(1000000).mul(ether));

    await LPfake1.connect(acc2).approve(liquidityPoolFactory.address, BigNumber.from(1000000).mul(ether));
    await liquidityPoolFactory.connect(acc2).deposit(
      1,
      ether
    );
    
    const [
      account2,
      balanceLpOfAccount2After,
      balanceLpPool,
    ] = await Promise.all([
      liquidityPoolFactory.userInfo(1, acc2.address),
      LPfake1.balanceOf(acc2.address),
      LPfake1.balanceOf(liquidityPoolFactory.address),
    ]);
    expect(balanceLpPool).to.equal(ether);
    expect(balanceLpOfAccount2After).to.equal(BigNumber.from(999999).mul(ether));
    expect(account2.amountOfLpToken).to.equal(ether);
    expect(account2.rewardDebt).to.equal(0);
  });

  it("should not deposit LP to pool 2", async () => {
    await truffleAssert.fails(
      liquidityPoolFactory.connect(acc2).deposit(
        2,
        ether,
      ),
      truffleAssert.ErrorType.REVERT,
      'Invalid pool id!'
    );
  });

  describe("transfer", () => {
    beforeEach(async () => {
      await LPfake1.connect(acc2).transfer(acc3.address, BigNumber.from(100000).mul(ether));
      await LPfake1.connect(acc2).transfer(acc4.address, BigNumber.from(100000).mul(ether));
      await LPfake1.connect(acc2).approve(liquidityPoolFactory.address, BigNumber.from(100000).mul(ether));
      await LPfake1.connect(acc3).approve(liquidityPoolFactory.address, BigNumber.from(100000).mul(ether));
      await LPfake1.connect(acc4).approve(liquidityPoolFactory.address, BigNumber.from(100000).mul(ether));
    })
    it("should deposit LP to pool 3 user", async () => {
      await liquidityPoolFactory.connect(acc2).deposit(
        1,
        ether
      );
      await liquidityPoolFactory.connect(acc3).deposit(
        1,
        BigNumber.from(3).mul(ether)
      );
      await liquidityPoolFactory.connect(acc4).deposit(
        1,
        ether
      );
      await liquidityPoolFactory.connect(acc5).deposit(
        1,
        0
      );
      const [
        account2,
        account3,
        account4,
        nasiOfPool,
      ] = await Promise.all([
        liquidityPoolFactory.userInfo(1, acc2.address),
        liquidityPoolFactory.userInfo(1, acc3.address),
        liquidityPoolFactory.userInfo(1, acc4.address),
        token.balanceOf(liquidityPoolFactory.address),
      ]);
  
      // expect(nasiOfPool).to.equal(BigNumber.from(15).mul(ether));
      expect(account2.amountOfLpToken).to.equal(ether);
      expect(account2.rewardDebt).to.equal(0);
      expect(account3.amountOfLpToken).to.equal(BigNumber.from(3).mul(ether));
      // expect(account3.rewardDebt).to.equal(BigNumber.from(15).mul(ether).mul(ether));
      expect(account4.amountOfLpToken).to.equal(ether);
      expect(account4.rewardDebt).to.equal(BigNumber.from(6250).mul(milliether).mul(ether));
  
      const pendingNasiOfAcc2 = await liquidityPoolFactory.pendingNasi(1, acc2.address);
      expect(pendingNasiOfAcc2).to.equal(BigNumber.from(7250).mul(milliether));
  
      const pendingNasiOfAcc3 = await liquidityPoolFactory.pendingNasi(1, acc3.address);
      expect(pendingNasiOfAcc3).to.equal(BigNumber.from(6750).mul(milliether));
  
      const pendingNasiOfAcc4 = await liquidityPoolFactory.pendingNasi(1, acc4.address);
      expect(pendingNasiOfAcc4).to.equal(BigNumber.from(1).mul(ether));
    });
  
    it("should deposit LP to pool 2 user then withdraw", async () => {
      await liquidityPoolFactory.connect(acc2).deposit(
        1,
        ether,
      );
      await liquidityPoolFactory.connect(acc3).deposit(
        1,
        BigNumber.from(3).mul(ether),
      );
  
      await liquidityPoolFactory.connect(acc2).deposit(
        1,
        ether,
      );
  
      const [
        account2,
        nasiOf2,
        nasiOfPool,
      ] = await Promise.all([
        liquidityPoolFactory.userInfo(1, acc2.address),
        token.balanceOf(acc2.address),
        token.balanceOf(liquidityPoolFactory.address),
      ]);
      expect(account2.amountOfLpToken).to.equal(BigNumber.from(2).mul(ether));
      expect(nasiOf2).to.equal(BigNumber.from(6250).mul(milliether));
      expect(nasiOfPool).to.equal(BigNumber.from(3750).mul(milliether));
    });

    it("test function", async () => {
      const result = await liquidityPoolFactory.getBonusMultiplier(11, 62);
      expect(result).to.equal(0);
    });
  
    it("should not withdraw LP if not enough fund", async () => {
      await liquidityPoolFactory.connect(acc2).deposit(
        1,
        ether
      );
      await liquidityPoolFactory.connect(acc3).deposit(
        1,
        BigNumber.from(2).mul(ether)
      );
  
      await truffleAssert.fails(
        liquidityPoolFactory.connect(acc2).withdraw(
          1,
          BigNumber.from(3).mul(ether)
        ),
        truffleAssert.ErrorType.REVERT,
        'Not enough funds!'
      );
    });
  
    it("should withdraw LP", async () => {
      await liquidityPoolFactory.connect(acc2).deposit(
        1,
        BigNumber.from(1000).mul(ether)
      );
  
      await liquidityPoolFactory.connect(acc3).deposit(
        1,
        BigNumber.from(3000).mul(ether)
      );
  
      await liquidityPoolFactory.connect(acc3).withdraw(
        1,
        BigNumber.from(2000).mul(ether)
      );
  
      await liquidityPoolFactory.connect(acc2).withdraw(
        1,
        BigNumber.from(1000).mul(ether)
      );

      await liquidityPoolFactory.connect(acc4).deposit(
        1,
        0
      );
  
  
      const [
        account2,
        account3,
        nasiOf2,
        nasiOf3,
        nasiOfPool,
        lpOfAcc3,
        lpOfPool
      ] = await Promise.all([
        liquidityPoolFactory.userInfo(1, acc2.address),
        liquidityPoolFactory.userInfo(1, acc3.address),
        token.balanceOf(acc2.address),
        token.balanceOf(acc3.address),
        token.balanceOf(liquidityPoolFactory.address),
        LPfake1.balanceOf(acc3.address),
        LPfake1.balanceOf(liquidityPoolFactory.address),
      ]);
      expect(account2.amountOfLpToken).to.equal(0);
      expect(account3.amountOfLpToken).to.equal(BigNumber.from(1000).mul(ether));
      expect(nasiOf2).to.equal(BigNumber.from(8750).mul(milliether));
      expect(nasiOf3).to.equal(BigNumber.from(3750).mul(milliether));
      expect(nasiOfPool).to.equal(BigNumber.from(7500).mul(milliether));
      expect(lpOfAcc3).to.equal(BigNumber.from(99000).mul(ether));
      expect(lpOfPool).to.equal(BigNumber.from(1000).mul(ether));
    });
  
    it("should change allocation point of pool", async () => {
      await liquidityPoolFactory.connect(owner).addLpToken(
        20,
        LPfake2.address,
        false,
      );
  
      const [
        pool1,
        pool2,
      ] = await Promise.all([
        liquidityPoolFactory.poolInfo(1),
        liquidityPoolFactory.poolInfo(2),
      ]);
      expect(await liquidityPoolFactory.totalAllocationPoint()).to.equal(30);
      expect(pool1.allocationPoint).to.equal(10);
      expect(pool2.allocationPoint).to.equal(20);
  
      await liquidityPoolFactory.connect(owner).setAllocationPoint(
        1,
        20,
        true,
      )
      expect(await liquidityPoolFactory.totalAllocationPoint()).to.equal(40);
      const pool1After = await liquidityPoolFactory.poolInfo(1);
      expect(pool1After.allocationPoint).to.equal(20);
    });
  
    it("Another acount should not change allocation point of pool", async () => {
      expect(await liquidityPoolFactory.poolCounter(), 1)
      await truffleAssert.fails(
        liquidityPoolFactory.connect(acc1).setAllocationPoint(
          2,
          20,
          true,
        ),
        truffleAssert.ErrorType.REVERT
      )
    });
  
    it("should not set migrator if dont have Owner role", async () => {
      await truffleAssert.fails(
        liquidityPoolFactory.connect(acc1).setMigrator(
          acc2.address,
        ),
        truffleAssert.ErrorType.REVERT
      )
    });
  
    it("should not set migrator equal to address 0", async () => {
      await truffleAssert.fails(
        liquidityPoolFactory.connect(owner).setMigrator(
          '0x0000000000000000000000000000000000000000',
        ),
        truffleAssert.ErrorType.REVERT
      )
    });
  })
});