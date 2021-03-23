const { expect } = require("chai");
const truffleAssert = require('truffle-assertions');

describe("Nasi token", function() {
  let nasiToken;
  let owner;
  let acc1;
  let acc2;
  let acc3;
  beforeEach(async () => {
    const NasiToken = await ethers.getContractFactory("NasiToken");
    nasiToken = await NasiToken.deploy();
    [owner, acc1, acc2, acc3] = await ethers.getSigners();
  });
  describe("Normal test", () => {
    it("Should appeare right name", async function() {
      expect(await nasiToken.name()).to.equal("NasiToken");
    });
  
    it("Should appeare right symbol", async function() {
      expect(await nasiToken.symbol()).to.equal("NAS");
    });
  
    it("Should appeare right decimal", async function() {
      expect(await nasiToken.decimals()).to.equal(18);
    });
  
    it("should add minter from owner, and minter can mint", async () => {
  
      await nasiToken.connect(owner).addMinter(acc1.address);
      await nasiToken.connect(acc1).mint(acc2.address, 1000);
  
      const balanceOfAccount2 = await nasiToken.balanceOf(acc2.address);
      expect(balanceOfAccount2.toNumber()).to.equal(1000);
    });
  
    it("should add minter from minter", async () => {
      await nasiToken.connect(owner).addMinter(acc1.address);
      await nasiToken.connect(acc1).addMinter(acc2.address);
    });
  
    it("should not add minter from another", async () => {
      await truffleAssert.fails(
        nasiToken.connect(acc1).addMinter(acc2.address),
        truffleAssert.ErrorType.REVERT
      );
    });
  
    it("after renounce minter Role, user can not addMinter or mint", async () => {
      await nasiToken.connect(owner).renounceMinter();
      
      await truffleAssert.fails(
        nasiToken.connect(owner).addMinter(acc1.address),
        truffleAssert.ErrorType.REVERT
      );
  
      await truffleAssert.fails(
        nasiToken.connect(owner).mint(acc2.address, 1000),
        truffleAssert.ErrorType.REVERT
      );
    });
  
    it("after transfer owner role, user can not transfer again", async () => {
      await nasiToken.connect(owner).transferOwnership(acc1.address);
      
      await truffleAssert.fails(
        nasiToken.connect(owner).transferOwnership(acc2.address),
        truffleAssert.ErrorType.REVERT
      );
  
      await truffleAssert.passes(
        nasiToken.connect(acc1).transferOwnership(acc2.address)
      );
    });
  
    it("after transfer owner role, user still have minter role, new Owner has not minter role", async () => {
      await nasiToken.connect(owner).transferOwnership(acc1.address);
      
      await truffleAssert.fails(
        nasiToken.connect(acc1).mint(acc2.address, 1000),
        truffleAssert.ErrorType.REVERT
      );
  
      await truffleAssert.passes(
        nasiToken.connect(owner).mint(acc2.address, 1000)
      );
    });
  });

  describe("Governance test", () => {
    it("sign fail", async () => {
      await truffleAssert.fails(
        nasiToken.connect(owner).delegateBySig(
          acc1.address,
          10,
          1000,
          10,
          ethers.utils.formatBytes32String("test"),
          ethers.utils.formatBytes32String("test"),
        ),
        truffleAssert.ErrorType.REVERT
      );
    });

    it("should delagate", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
  
      await nasiToken.connect(acc1).delegate(acc3.address);
      expect(await nasiToken.delegates(acc1.address)).to.equal(acc3.address);

      expect(await nasiToken.getCurrentVotes(acc3.address)).to.equal(1000);
    });

    it("should delagate more but number of votes not change", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
  
      await nasiToken.connect(acc1).delegate(acc3.address);
      await nasiToken.connect(acc1).delegate(acc3.address);

      expect(await nasiToken.delegates(acc1.address)).to.equal(acc3.address);

      expect(await nasiToken.getCurrentVotes(acc3.address)).to.equal(1000);
    });

    it("should delagate to another delegatee", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      await nasiToken.connect(acc1).delegate(acc3.address);
      await nasiToken.connect(acc1).delegate(acc2.address);

      expect(await nasiToken.delegates(acc1.address)).to.equal(acc2.address);

      expect(await nasiToken.getCurrentVotes(acc2.address)).to.equal(1000);
      expect(await nasiToken.getCurrentVotes(acc3.address)).to.equal(0);
    });

    it("should delagate to another delegatee after mint more token", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      await nasiToken.connect(acc1).delegate(acc3.address);
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      await nasiToken.connect(acc1).delegate(acc2.address);

      expect(await nasiToken.delegates(acc1.address)).to.equal(acc2.address);

      expect(await nasiToken.getCurrentVotes(acc2.address)).to.equal(2000);
      expect(await nasiToken.getCurrentVotes(acc3.address)).to.equal(0);
    });

    it("should delagate with two accounts", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      await nasiToken.connect(owner).mint(acc2.address, 1000);
      await nasiToken.connect(acc1).delegate(acc3.address);
      await nasiToken.connect(acc2).delegate(acc3.address);

      expect(await nasiToken.getCurrentVotes(acc3.address)).to.equal(2000);
    });

    it("should delagate my self", async () => {
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      nasiToken.connect(acc1).delegate(acc1.address),
      expect(await nasiToken.getCurrentVotes(acc1.address)).to.equal(1000);
    });

    it("should get votes of a current block", async () => {
  
      await nasiToken.connect(owner).mint(acc1.address, 1000);
      await nasiToken.connect(acc1).delegate(acc3.address);
      
      const block = await ethers.provider.getBlockNumber();
      await nasiToken.connect(owner).mint(acc2.address, 1000);
      await nasiToken.connect(acc2).delegate(acc3.address);
      const block2 = await ethers.provider.getBlockNumber();
      await nasiToken.connect(owner).mint(acc2.address, 1000);
      expect(await nasiToken.getPriorVotes(acc3.address, block)).to.equal(1000);
      expect(await nasiToken.getPriorVotes(acc3.address, block2)).to.equal(2000);
    });
  });
});