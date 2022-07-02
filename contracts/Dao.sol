//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Staking.sol";

struct VoterInfo {
    mapping(uint256 => bool) votedProposals;
    uint256 canWithdrawAfterTimestamp;
}

struct ProposalInfo {
    bytes signature;
    address recipient;
    string description;
    uint256 votesFor;
    uint256 votesAgainst;
    uint256 startDateTimestamp;
    bool isDone;
}

contract Dao {
    using SafeERC20 for IERC20;

    event SuccessfulProposalPoll(uint256 proposalId);
    event UnsuccessfulProposalPoll(uint256 proposalId);

    address _chairman;
    address _voteToken;
    address _stakingContract;
    uint256 _minimumQuorum;
    uint256 _debatingPeriodDurationSec;
    uint256 _proposalCount = 1;

    mapping(address => VoterInfo) _votersInfo;
    mapping(uint256 => ProposalInfo) _proposals;

    modifier onlyChairman() {
        require(
            msg.sender == _chairman,
            "Only the chairman of the dao contract can perform this operation"
        );
        _;
    }

    constructor(address chairman, address voteToken, address stakingContract, uint256 minimumQuorum, uint256 debatingPeriodDurationSec) {
        _chairman = chairman;
        _voteToken = voteToken;
        _stakingContract = stakingContract;
        _minimumQuorum = minimumQuorum;
        _debatingPeriodDurationSec = debatingPeriodDurationSec;
    }

     function getChairman() public view returns(address) {
        return _chairman;
    }

    function getVoteToken() public view returns(address) {
        return _voteToken;
    }

    function getStakingContract() public view returns(address) {
        return _stakingContract;
    }

    function getMinimumQuorum() public view returns(uint256) {
        return _minimumQuorum;
    }

    function getDebatingPeriodDurationSec() public view returns(uint256) {
        return _debatingPeriodDurationSec;
    }

    function getProposalCount() public view returns(uint256) {
        return _proposalCount;
    }

    function getProposalInfo(uint256 proposalId) public view returns(ProposalInfo memory) {
        return _proposals[proposalId];
    }

    function addProposal(bytes memory callData, address recipient, string memory description) external onlyChairman {
        _proposals[_proposalCount++] = ProposalInfo(callData, recipient, description, 0, 0, block.timestamp, false);
    }

    function vote(uint256 proposalId, bool isFor) external {
        uint256 stakingAmount = Staking(_stakingContract).getStakingAmount(msg.sender);

        require(stakingAmount != 0, "The user doesn't have tokens to vote");
        require(!_votersInfo[msg.sender].votedProposals[proposalId], "The voter has already voted");
        require(!_proposals[proposalId].isDone, "The proposal has been already done");
        _votersInfo[msg.sender].votedProposals[proposalId] = true;

        uint256 proposalEndTime = _proposals[proposalId].startDateTimestamp + _debatingPeriodDurationSec;

        if(proposalEndTime > _votersInfo[msg.sender].canWithdrawAfterTimestamp) {
            _votersInfo[msg.sender].canWithdrawAfterTimestamp = proposalEndTime;
        }

        if(isFor)
        {
            _proposals[proposalId].votesFor += stakingAmount;
        } else {
            _proposals[proposalId].votesAgainst += stakingAmount;
        }
    }

    function finishProposal(uint256 proposalId) external {
        require(!_proposals[proposalId].isDone, "The proposal has been already done");
        require(_minimumQuorum < (_proposals[proposalId].votesFor + _proposals[proposalId].votesAgainst), "Not enough votes");
        require(block.timestamp > (_proposals[proposalId].startDateTimestamp + _debatingPeriodDurationSec), "The poll hasn't finished yet");

        if(_proposals[proposalId].votesFor <=  _proposals[proposalId].votesAgainst) {
            emit UnsuccessfulProposalPoll(proposalId);
        } else {
            (bool success,) = _proposals[proposalId].recipient.call(_proposals[proposalId].signature);
            require(success, "Unsuccessful function call");
            emit SuccessfulProposalPoll(proposalId);
        }
        
        _proposals[proposalId].isDone = true;
    }

    function getLastProposalEndTimeTimestamp(address voterAddress) public view returns(uint256) {
        return _votersInfo[voterAddress].canWithdrawAfterTimestamp;
    }
}