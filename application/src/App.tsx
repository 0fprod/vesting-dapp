import { ConnectWallet, useChain, useAddress, useContract } from '@thirdweb-dev/react';
import './styles/Home.css';
import { useEffect, useState } from 'react';
import { erc20TokenAddress, erc20TokenABI } from '../constants';
import { utils } from 'ethers';

export default function Home() {
  const chain = useChain();
  const address = useAddress();
  const [erc20balance, setErc20Balance] = useState('0');
  const { contract } = useContract(erc20TokenAddress, erc20TokenABI);

  const refreshBalance = () => {
    if (address && contract) {
      contract.call('balanceOf', [address]).then((balance: any) => {
        setErc20Balance(utils.formatEther(balance));
      });
    }
  };

  useEffect(() => {
    refreshBalance();
  }, [address, contract]);

  return (
    <main className="main">
      <div className="container">
        <div className="header">
          <h1 className="title">
            Welcome to <span className="gradient-text-0">Vesting Dapp.</span>
          </h1>
          <div className="grid">
            <div className="connect">
              <ConnectWallet
                dropdownPosition={{
                  side: 'bottom',
                  align: 'center',
                }}
              />
            </div>
            <p> Connected to chain: {chain ? chain.chain : 'None'}</p>
            <p> Erc20 balance: {erc20balance} 🤘🏼</p>
          </div>
        </div>

        <div className="grid"></div>
      </div>
    </main>
  );
}
