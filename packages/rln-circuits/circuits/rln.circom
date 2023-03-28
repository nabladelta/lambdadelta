pragma circom 2.1.0;

include "./incrementalMerkleTree.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template RLN(DEPTH) {
    // Private signals
    signal input identitySecret;
    signal input pathElements[DEPTH];
    signal input identityPathIndex[DEPTH];

    // Public signals
    signal input x;
    signal input externalNullifier;

    // Outputs
    signal output y;
    signal output root;
    signal output nullifier;

    // Identity commitment calculation
    signal identityCommitment <== Poseidon(1)([identitySecret]);

    // Merkle tree inclusion proof // Outputs the root
    root <== MerkleTreeInclusionProof(DEPTH)(identityCommitment, identityPathIndex, pathElements);

    // Linear equation constraints:
    // a1 = Poseidon(identitySecret, externalNullifier)
    // y = a0 + a1 * x
    // nullifier = Poseidon(a1)
    signal a1 <== Poseidon(2)([identitySecret, externalNullifier]);
    y <== identitySecret + a1 * x;

    nullifier <== Poseidon(1)([a1]);
}

component main { public [x, externalNullifier] } = RLN(20);