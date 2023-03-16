//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "@openzeppelin/contracts/utils/Context.sol";

/// @title Greeter contract.
/// @dev The following code is just a example to show how Semaphore can be used.
contract BernkastelGroup is Context {
    event Signal(bytes32 signalValue);
    event NewUser(uint256 indexed identityCommitment, address indexed userAddress);

    ISemaphore public semaphore;

    uint256 public groupId;
    mapping(uint256 => address) public users;

    constructor(address semaphoreAddress, uint256 _groupId) {
        semaphore = ISemaphore(semaphoreAddress);
        groupId = _groupId;

        semaphore.createGroup(groupId, 20, address(this));
    }

    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);

        users[identityCommitment] = _msgSender();

        emit NewUser(identityCommitment, _msgSender());
    }

    function signal(
        bytes32 signalValue,
        uint256 merkleTreeRoot,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        semaphore.verifyProof(groupId, merkleTreeRoot, uint256(signalValue), nullifierHash, groupId, proof);

        emit Signal(signalValue);
    }
}
