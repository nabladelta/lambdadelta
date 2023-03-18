const { program } = require('commander')
const { spawn, execSync } = require("child_process");
const { mkdirSync, renameSync } = require('fs');
const path = require('path');

program
    .command('run <name> <scheme>')
    .description('Run')
    .action(run)

function run(name, scheme, tauname) {
    const root = process.cwd()
    const tauFile = path.join(root, 'tau', tauname)
    const build = path.join(root, 'build')
    const circuitFile = path.join(root, 'circuits', name+'.circom')
    const setup = path.join(root, 'build', 'setup', scheme, name)

    const dest = path.join(root, 'compiled', name)
    mkdirSync(setup, {recursive: true})
    mkdirSync(dest, {recursive: true})
    mkdirSync(path.join(dest, scheme), {recursive: true})


    process.chdir(build)
    execSync(`circom ${circuitFile} --r1cs --wasm --sym`)
    renameSync(path.join(build, `${name}_js`, `${name}.wasm`), path.join(build, `${name}_js`, `circuit.wasm`))
    renameSync(path.join(build, `${name}_js`), path.join(dest, 'js'))
    execSync(`snarkjs r1cs export json ${name}.r1cs ${name}.r1cs.json`)
    if (scheme == 'groth16') {
        execSync(`snarkjs groth16 setup ${name}.r1cs ${tauFile} ${path.join(setup, 'rln_0000.zkey')} `)
        execSync(`snarkjs zkey contribute ${path.join(setup, 'rln_0000.zkey')} ${path.join(setup, 'rln_0001.zkey')} --name="First contribution" -v -e="Random entropy"`)
        execSync(`snarkjs zkey contribute ${path.join(setup, 'rln_0001.zkey')} ${path.join(setup, 'rln_0002.zkey')} --name="Second contribution" -v -e="Random entropy 2"`)
        execSync(`snarkjs zkey beacon ${path.join(setup, 'rln_0002.zkey')} ${path.join(setup, 'final.zkey')} 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon phase2"`)
        execSync(`snarkjs zkey export verificationkey ${path.join(setup, 'final.zkey')} ${path.join(dest, scheme, 'verification_key.json')}`)
        execSync(`snarkjs zkey export solidityverifier ${path.join(setup, 'final.zkey')}  ${path.join(dest, scheme, 'verifier.sol')}`)
        renameSync(path.join(setup, 'final.zkey'), path.join(dest, scheme, 'final.zkey'))
    }
}

run('rln-same-dual', 'groth16', "powersOfTau28_hez_final_17.ptau")