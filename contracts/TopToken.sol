//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TopToken is ERC20 {
    address _owner;
    address _acdmPlatform;

    modifier restricted() {
        require(
            msg.sender == _owner,
            "Only the owner of contract can perform this operation"
        );
        _;
    }

     modifier onlyPlatform() {
        require(
            msg.sender == _acdmPlatform,
            "Only the acdm platfrom can perform this operation"
        );
        _;
    }

    constructor() ERC20("Top coin", "TOP") {
        _owner = msg.sender;
        _mint(msg.sender, 1000 * (10**18));
    }
    
    function setPlatrformContract(address platform) external restricted {
        _acdmPlatform = platform;
    }

    function burn(address to, uint256 amount) external onlyPlatform {
        _burn(to, amount);
    }
}