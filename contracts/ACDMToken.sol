//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ACDMToken is ERC20 {
    address private _owner;
    address private _platformAddress;

    modifier restricted() {
        require(
            msg.sender == _owner,
            "Only the owner of contract can perform this operation"
        );
        _;
    }

    modifier onlyPlatform() {
        require(
            msg.sender == _platformAddress,
            "Only the acdm platform can perform this operation"
        );
        _;
    }

    constructor() ERC20("ACADEM Coin", "ACDM") {
        _owner = msg.sender;
    }

    function setPlatform(address platformAddress) external restricted {
        _platformAddress = platformAddress;
    }

    function decimals() public view override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyPlatform {
        _mint(to, amount);
        _approve(address(this), _platformAddress, totalSupply());
    }

    function burn(address to, uint256 amount) external onlyPlatform {
        _burn(to, amount);
    }
}