//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./Dao.sol";

contract Staking {
    using SafeERC20 for IERC20;
    
    IERC20 private _rewardsToken;
    IERC20 private _stakingToken;
    mapping(address => uint256) private _stakingAmounts;
    mapping(address => uint256) private _stakingTimestamps;
    uint256 private _unstakeTimeoutSeconds = 1200;
    address private _owner;
    address private _daoPlatform;
    bytes32 private _merkleRoot;

    modifier restricted() {
        require(
            msg.sender == _owner,
            "Only the owner of the contract can perform this operation"
        );
        _;
    }

    modifier onlyDao() {
        require(
            msg.sender == _daoPlatform,
            "Only the dao platform can perform this operation"
        );
        _;
    }

    modifier isWhitelisted(bytes32[] memory merkleProof) {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(merkleProof, _merkleRoot, leaf), "Not on the whitelist");
        _;
    }

    constructor(address rewardsToken, address stakingToken, bytes32 merkleRoot) {
        _owner = msg.sender;
        _rewardsToken = IERC20(rewardsToken);
        _stakingToken = IERC20(stakingToken);
        _merkleRoot = merkleRoot;
    }

    function initDao(address dao) external restricted {
        _daoPlatform = dao;
    }

    function changeRoot(bytes32 merkleRoot) external onlyDao {
        _merkleRoot = merkleRoot;
    }

    function unstakeTimeout() public view returns (uint256) {
        return _unstakeTimeoutSeconds;
    }

    function changeSettings(
        uint256 unstakeTimeoutDays
    ) external onlyDao {
        _unstakeTimeoutSeconds = 60*60*24*unstakeTimeoutDays;
    }

    function stake(uint256 amount, bytes32[] memory merkleProof) external isWhitelisted(merkleProof) {
        require(
            _stakingToken.transferFrom(msg.sender, address(this), amount),
            "Couldn't stake LP tokens"
        );

        _stakingAmounts[msg.sender] += amount;
        _stakingTimestamps[msg.sender] = block.timestamp;
    }

    function getStakingAmount(address addrs) public view returns (uint256) {
        return _stakingAmounts[addrs];
    }

    function getStakingTimestamp(address addrs) public view returns (uint256) {
        return _stakingTimestamps[addrs];
    }

    function claim() external {
        uint256 stakingTimestamp = _stakingTimestamps[msg.sender];
        uint256 amount = _stakingAmounts[msg.sender];
        require(stakingTimestamp > 0 && amount > 0, "Nothing to claim");
        uint256 now = block.timestamp;

        // 3% reward every week
        uint256 reward = (3 * (now - stakingTimestamp) * amount) / (100 * 60 * 60 * 24 * 7);
        require(reward > 0, "Insufficient reward");
        _stakingTimestamps[msg.sender] = now;
        _rewardsToken.transfer(msg.sender, reward);
    }

    function unstake() external {
        require(_stakingAmounts[msg.sender] > 0, "Nothing to unstake");
        require(
            _stakingTimestamps[msg.sender] + (_unstakeTimeoutSeconds) <=
                block.timestamp,
            "Unstake timeout has not expired yet"
        );
        require(Dao(_daoPlatform).getLastProposalEndTimeTimestamp(msg.sender) < block.timestamp, "User is still in ongoing dao polls");

        uint256 amount = _stakingAmounts[msg.sender];
        _stakingAmounts[msg.sender] = 0;
        _stakingTimestamps[msg.sender] = 0;
        _stakingToken.safeTransfer(msg.sender, amount);
    }

}