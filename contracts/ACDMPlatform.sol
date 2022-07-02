//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "./ACDMToken.sol";
import "./TopToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

enum Stage { NONE, SELL_ROUND, CAN_START_TRADE_ROUND, TRADE_ROUND }

struct Order {
    address owner;
    uint256 price;
    uint256 volume;
    bool isRemoved;
}

contract ACDMPlatform {
    using SafeERC20 for IERC20;

    address _acdmToken;
    address _topToken;
    address _daoPlatform;
    uint256 _roundDurationSec;
    uint256 _startRoundTimestamp;
    mapping(address => address) _referrals;
    mapping(address => bool) _registedUsers;
    uint256 _lastTokenPrice;
    Stage _stage;
    uint256 _nextOrderId;
    mapping(uint256 => Order) _ordersBook;
    uint256 _accumulatedPlatformCommission;
    uint256 _tradeRoundVolume;

    modifier tradeOnly() {
        require(_stage == Stage.TRADE_ROUND && (_startRoundTimestamp + _roundDurationSec) > block.timestamp, "Trade round is over");
        _;
    }

    modifier registed(address userAddress) {
        require(_registedUsers[userAddress], "Only for registed users");
        _;
    }

     modifier onlyDao() {
        require(
            msg.sender == _daoPlatform,
            "Only the dao platform can perform this operation"
        );
        _;
    }

    constructor(address acdmToken, address topToken, address dao, uint256 roundDurationSec) {
        _acdmToken = acdmToken;
        _roundDurationSec = roundDurationSec;
        _topToken = topToken;
        _daoPlatform = dao;

        // set certain volume for first round
        _tradeRoundVolume = 1 * 10 ** 18;
        _stage = Stage.NONE;
    }

    function register(address referral) external {
        require(referral == address(0) || (referral != address(0) && _registedUsers[referral]), "Referral should be registed");
        _referrals[msg.sender] = referral;
        _registedUsers[msg.sender] = true;
    }

    // sell round
    function startSellRound() external {
        require(_stage == Stage.NONE || _stage == Stage.TRADE_ROUND, "Cannot start sell round");
        require(block.timestamp > (_startRoundTimestamp + _roundDurationSec), "Trade round isn't over"); 

        if(_tradeRoundVolume == 0) {
            _stage = Stage.CAN_START_TRADE_ROUND;
            return;
        }

        _lastTokenPrice = _startRoundTimestamp == 0 ? 0.00001 * 10 ** 18 : (_lastTokenPrice * 103/100 + 0.000004 * 10**18);

        _startRoundTimestamp = block.timestamp;
        _stage = Stage.SELL_ROUND;
        ACDMToken(_acdmToken).mint(_acdmToken, 10 ** 6 * _tradeRoundVolume / _lastTokenPrice);
    }

     function buyACDM() payable external registed(msg.sender) {
        require(_stage == Stage.SELL_ROUND, "Sell round hasn't start yet");
        require((_startRoundTimestamp + _roundDurationSec) > block.timestamp, "Sell round is over");
        buyACDMTokens(_acdmToken, msg.sender, msg.value, IERC20(_acdmToken).balanceOf(_acdmToken), _lastTokenPrice, false);
    }

    // trade round
    function startTradeRound() external {
        require(_stage == Stage.SELL_ROUND || _stage == Stage.CAN_START_TRADE_ROUND, "Cannot start trade round");
        uint256 acdmTokensAmount = IERC20(_acdmToken).balanceOf(_acdmToken);
        require(((_startRoundTimestamp + _roundDurationSec) < block.timestamp) || acdmTokensAmount == 0, "Sell round isn't over");

        if(acdmTokensAmount != 0)
        {
            ACDMToken(_acdmToken).burn(_acdmToken, acdmTokensAmount);
        }
        
        _stage = Stage.TRADE_ROUND;
        _startRoundTimestamp = block.timestamp;
        _tradeRoundVolume = 0;
    }

    function addOrder(uint256 price, uint256 volume) external registed(msg.sender) tradeOnly {
        require(IERC20(_acdmToken).balanceOf(msg.sender) >= volume, "Not enough acdm tokens");
        _ordersBook[_nextOrderId++] = Order(msg.sender, price, volume, false); 
        IERC20(_acdmToken).transferFrom(msg.sender, address(this), volume);
    }

    function removeOrder(uint256 orderId, uint256 volume) external registed(msg.sender) tradeOnly {
        require(_ordersBook[orderId].owner == msg.sender, "Doesn't have a permission");
        require(_ordersBook[orderId].volume >= volume, "Invalid volume");
        if(volume == 0) {
            _ordersBook[orderId].isRemoved = true;
            volume = _ordersBook[orderId].volume;
        } else {
            _ordersBook[orderId].volume -= volume;
        }

        IERC20(_acdmToken).safeTransfer(_ordersBook[orderId].owner, volume);
    }

    function redeemOrder(uint256 orderId) payable external registed(msg.sender) tradeOnly {
        // seller gets 95%, referrals get 2.5% or platform gets 5% of eth price
        require(!_ordersBook[orderId].isRemoved, "Order cannot be sold");
        uint256 actualEthPayment = buyACDMTokens(address(this), msg.sender, msg.value, _ordersBook[orderId].volume, _ordersBook[orderId].price, true);
        
        if(_referrals[msg.sender] == address(0)) {
            _accumulatedPlatformCommission += actualEthPayment * 5 / 100;
        }

        payable(_ordersBook[orderId].owner).transfer(actualEthPayment * 95 / 100);

        _tradeRoundVolume += actualEthPayment;
    }

    function buyACDMTokens(address seller, address senderAddress, uint256 senderValue, uint256 totalACDMTokens, uint256 price, bool isTradeRound) internal returns(uint256) {
        uint256 minimumPrice = price / 10 ** 6;        
        require(senderValue >= minimumPrice, "Not enough funds");
        require(totalACDMTokens > 0, "All tokens are sold");
        uint256 amountToBuy = senderValue / minimumPrice;

        if(amountToBuy > totalACDMTokens) {
            amountToBuy = totalACDMTokens;
        }

        if(isTradeRound){
            IERC20(_acdmToken).safeTransfer(senderAddress, amountToBuy);
        } else {
            IERC20(_acdmToken).transferFrom(seller, senderAddress, amountToBuy);
        }
        uint256 actualEthPayment = amountToBuy * minimumPrice;
        // returns remains eth
        uint256 remains = senderValue - actualEthPayment;
        if(remains != 0)
        {
            payable(senderAddress).transfer(remains);
        }

        if(_referrals[senderAddress] != address(0))
        {
            payable(_referrals[senderAddress]).transfer(actualEthPayment * (isTradeRound ? 25 : 50) / 1000);

            if(_referrals[_referrals[senderAddress]] != address(0)) {
                payable(_referrals[_referrals[senderAddress]]).transfer(actualEthPayment * (isTradeRound ? 25 : 30) / 1000);
            }
        }

        return actualEthPayment;
    }

    function burnTokens(address pair) external onlyDao {
        address[] memory path = new address[](2);
        path[0] = 0xc778417E063141139Fce010982780140Aa0cD5Ab; // WETH address
        path[1] = _topToken;
        (uint256 topTokenReserves, uint256 wethReserves,) = IUniswapV2Pair(pair).getReserves();
        address router = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D; // uniswap router
        uint256 amountOutMin = IUniswapV2Router02(router).getAmountOut(_accumulatedPlatformCommission, wethReserves, topTokenReserves);
        IUniswapV2Router02(router).swapExactETHForTokens{value: _accumulatedPlatformCommission}(amountOutMin, path, address(this), block.timestamp);
        TopToken(_topToken).burn(address(this), IERC20(_topToken).balanceOf(address(this)));
    }

    function sendCommission(address to) external onlyDao {
        payable(to).transfer(_accumulatedPlatformCommission);
    }
}