const sdk = require('@defillama/sdk');
const utils = require('../utils');

// JUSD deploys USDC into curated credit strategies, issued through two vaults:
// Accountable on Ethereum and Venzo on Arbitrum. The current strategy rate is
// set on chain in the Accountable loan's terms (loan().interestRate, in units of
// BASIS_POINTS = 1e6). It is the topline rate before issuer platform fees and
// applies to both vaults, since both run the same strategy.
const RATE_SOURCE = {
  chain: 'ethereum',
  loan: '0x4c376DF2f5182F5373502ccAB12700c479d8A128', // Accountable JUSD loan
};

const VAULTS = [
  {
    chain: 'ethereum',
    vault: '0x2B5895b716311A1eaC8f93fB88C56aF9eC8C1A69',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    issuer: 'Accountable',
  },
  {
    chain: 'arbitrum',
    vault: '0x9519217E8926A2B39BAcD2d6EC3EfD02503595E2',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    issuer: 'Venzo',
  },
];

const abis = {
  loan: 'function loan() view returns (uint256 minDeposit, uint256 minRedeem, uint256 maxCapacity, uint256 minCapacity, uint256 reserveThreshold, uint256 outstandingPrincipal, uint256 outstandingInterest, uint256 drawableFunds, uint256 interestRate, uint256 lateInterestPenalty, uint256 claimableInterest, uint256 interestInterval, uint256 startTime, uint256 termsSetTime, uint256 termsUpdateTime, uint256 duration, uint256 depositPeriod, uint256 acceptGracePeriod, uint256 withdrawalPeriod, uint256 lateInterestGracePeriod)',
  basisPoints: 'function BASIS_POINTS() view returns (uint256)',
  convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
};

const strategyApy = async () => {
  const [terms, basisPoints] = await Promise.all([
    sdk.api.abi.call({ chain: RATE_SOURCE.chain, target: RATE_SOURCE.loan, abi: abis.loan }),
    sdk.api.abi.call({ chain: RATE_SOURCE.chain, target: RATE_SOURCE.loan, abi: abis.basisPoints }),
  ]);
  return (Number(terms.output.interestRate) / Number(basisPoints.output)) * 100;
};

const vaultTvlUsd = async ({ chain, vault, usdc }) => {
  const supply = (await sdk.api.abi.call({ chain, target: vault, abi: 'erc20:totalSupply' })).output;
  const assets = (await sdk.api.abi.call({ chain, target: vault, abi: abis.convertToAssets, params: [supply] })).output;
  const { pricesByAddress } = await utils.getPrices([usdc], chain);
  const price = pricesByAddress[usdc.toLowerCase()] ?? 1;
  return (Number(assets) / 1e6) * price;
};

const apy = async () => {
  const apyBase = await strategyApy();
  return Promise.all(
    VAULTS.map(async (v) => ({
      pool: `${v.vault}-${v.chain}`.toLowerCase(),
      chain: utils.formatChain(v.chain),
      project: 'jusd-finance',
      symbol: 'JUSD',
      token: v.vault,
      tvlUsd: await vaultTvlUsd(v),
      apyBase,
      underlyingTokens: [v.usdc],
      poolMeta: `${v.issuer} vault, topline rate before issuer fees`,
      url: 'https://jusd.fi',
    }))
  );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://jusd.fi',
};
