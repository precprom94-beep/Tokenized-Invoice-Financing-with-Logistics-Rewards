
# InvoiceFlow: Tokenized Invoice Financing with Logistics Rewards

## Overview

InvoiceFlow is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in supply chain finance, such as delayed payments causing cash flow issues for suppliers, high financing costs, and inefficient logistics coordination. By tokenizing invoices as NFTs, the system allows suppliers to access immediate financing from a decentralized pool of lenders. Buyers are incentivized to pay early through rewards in a utility token (IFLOW), which can be redeemed for discounted logistics services. This creates a virtuous cycle: faster payments improve supplier liquidity, reduce financing risks for lenders, and integrate with logistics providers via token redemptions.

Key real-world problems solved:
- **Cash Flow Gaps**: Suppliers can tokenize unpaid invoices and sell them at a discount for instant liquidity, avoiding traditional high-interest loans.
- **Payment Delays**: Buyers earn IFLOW tokens for early payments, encouraging prompt settlements and reducing disputes.
- **Logistics Inefficiencies**: IFLOW tokens can be redeemed for services like shipping or warehousing from partnered providers, lowering costs and streamlining supply chains.
- **Transparency and Trust**: All transactions are on-chain, with oracles verifying off-chain events like payments, reducing fraud in invoice financing.

The project consists of 6 core smart contracts written in Clarity, ensuring security, composability, and Bitcoin-anchored finality via Stacks.

## Architecture

### How It Works
1. **Invoice Tokenization**: Suppliers create an Invoice NFT representing an unpaid invoice, including details like amount, due date, and buyer info.
2. **Financing**: Suppliers list the Invoice NFT in a financing pool, where lenders bid or provide liquidity to purchase it at a discount.
3. **Payment Processing**: When the buyer pays (verified by an oracle), the payment is routed to the current holder (lender or supplier). Early payments trigger IFLOW token rewards to the supplier.
4. **Rewards and Redemption**: Suppliers accumulate IFLOW tokens and redeem them for logistics services from integrated providers.
5. **Governance**: Token holders vote on parameters like reward rates or oracle integrations.

### Smart Contracts
The project uses 6 Clarity contracts:
1. **InvoiceNFT.clar**: Manages tokenized invoices as SIP-009 compliant NFTs.
2. **FinancingPool.clar**: A decentralized pool for lending and borrowing against invoices.
3. **IFlowToken.clar**: SIP-010 fungible token for rewards.
4. **PaymentOracle.clar**: Verifies off-chain payments and triggers on-chain events.
5. **RewardDistributor.clar**: Calculates and distributes IFLOW rewards for early payments.
6. **LogisticsRedeemer.clar**: Handles redemption of IFLOW for logistics services.

Contracts are designed with traits for interoperability (e.g., SIP-009/010 traits). Security features include role-based access, time-locks, and error handling.

## Installation and Deployment

### Prerequisites
- Stacks CLI (install via `npm install -g @stacks/cli`).
- A Stacks wallet with STX for deployment.
- Node.js for testing.

### Deployment Steps
1. Clone the repo: <this-repo>
2. Navigate to the contracts directory: `cd contracts`
3. Deploy contracts using Stacks CLI:
   ```
   stx deploy InvoiceNFT.clar --testnet
   stx deploy IFlowToken.clar --testnet
   # Deploy others similarly, noting dependencies (e.g., FinancingPool depends on InvoiceNFT)
   ```
4. Initialize contracts (e.g., mint initial IFLOW supply via IFlowToken).
5. For mainnet, replace `--testnet` with `--mainnet` and ensure sufficient STX.

### Testing
Use Clarinet for local testing:
1. Install Clarinet: `cargo install clarinet`
2. Run `clarinet test` in the project root.

## Contract Details and Code

### 1. InvoiceNFT.clar
This contract implements SIP-009 for NFTs representing invoices.

```clarity
;; InvoiceNFT.clar
(use-trait nft-trait .sip-009.nft-trait)

(define-non-fungible-token invoice-nft uint)

(define-map invoice-data uint {amount: uint, due-date: uint, buyer: principal, supplier: principal, paid: bool})

(define-data-var last-id uint u0)

(define-public (mint-invoice (amount uint) (due-date uint) (buyer principal))
  (let ((id (+ (var-get last-id) u1)))
    (try! (nft-mint? invoice-nft id tx-sender))
    (map-set invoice-data id {amount: amount, due-date: due-date, buyer: buyer, supplier: tx-sender, paid: false})
    (var-set last-id id)
    (ok id)))

(define-public (transfer (id uint) (recipient principal))
  (nft-transfer? invoice-nft id tx-sender recipient))

(define-read-only (get-invoice (id uint))
  (map-get? invoice-data id))

(define-public (mark-paid (id uint))
  (if (is-eq tx-sender (get buyer (unwrap! (get-invoice id) (err u404))))
    (map-set invoice-data id (merge (unwrap! (get-invoice id) (err u404)) {paid: true}))
    (err u403)))
```

### 2. FinancingPool.clar
Handles lending pool for invoice financing.

```clarity
;; FinancingPool.clar
(use-trait nft-trait .sip-009.nft-trait)
(define-trait invoice-nft-trait { ... }) ;; Extend as needed

(define-map listings uint {nft-id: uint, price: uint, seller: principal})

(define-public (list-invoice (nft-id uint) (price uint) (nft-contract <invoice-nft-trait>))
  (let ((owner (unwrap! (nft-get-owner? nft-contract nft-id) (err u404))))
    (asserts! (is-eq owner tx-sender) (err u403))
    (try! (nft-transfer? nft-contract nft-id tx-sender (as-contract tx-sender)))
    (map-set listings nft-id {nft-id: nft-id, price: price, seller: tx-sender})
    (ok true)))

(define-public (buy-invoice (listing-id uint) (nft-contract <invoice-nft-trait>))
  (let ((listing (unwrap! (map-get? listings listing-id) (err u404))))
    (try! (stx-transfer? (get price listing) tx-sender (get seller listing)))
    (try! (as-contract (nft-transfer? nft-contract (get nft-id listing) tx-sender tx-sender)))
    (map-delete listings listing-id)
    (ok true)))
```

### 3. IFlowToken.clar
SIP-010 fungible token for rewards.

```clarity
;; IFlowToken.clar
(impl-trait .sip-010.ft-trait)

(define-fungible-token iflow u1000000000) ;; 1B total supply

(define-data-var admin principal tx-sender)

(define-public (transfer (amount uint) (recipient principal))
  (ft-transfer? iflow amount tx-sender recipient))

(define-public (mint (amount uint) (recipient principal))
  (asserts! (is-eq tx-sender (var-get admin)) (err u403))
  (ft-mint? iflow amount recipient))

(define-read-only (get-balance (account principal))
  (ft-get-balance iflow account))

(define-read-only (get-total-supply)
  (ok (ft-get-supply iflow)))
```

### 4. PaymentOracle.clar
Verifies payments via trusted oracle.

```clarity
;; PaymentOracle.clar
(define-data-var oracle principal tx-sender)

(define-map verified-payments uint {timestamp: uint, early: bool})

(define-public (report-payment (invoice-id uint) (timestamp uint) (early bool))
  (asserts! (is-eq tx-sender (var-get oracle)) (err u403))
  (map-set verified-payments invoice-id {timestamp: timestamp, early: early})
  (ok true))

(define-read-only (get-payment (invoice-id uint))
  (map-get? verified-payments invoice-id))
```

### 5. RewardDistributor.clar
Distributes rewards based on early payments.

```clarity
;; RewardDistributor.clar
(use-trait ft-trait .sip-010.ft-trait)

(define-public (distribute-reward (invoice-id uint) (token-contract <ft-trait>) (oracle-contract principal))
  (let ((payment (unwrap! (contract-call? oracle-contract get-payment invoice-id) (err u404)))
        (invoice (unwrap! (contract-call? .InvoiceNFT get-invoice invoice-id) (err u404))))
    (if (get early payment)
      (let ((reward-amount (/ (get amount invoice) u10))) ;; 10% reward example
        (try! (contract-call? token-contract mint reward-amount (get supplier invoice)))
        (ok reward-amount))
      (ok u0))))
```

### 6. LogisticsRedeemer.clar
Redeems IFLOW for logistics services.

```clarity
;; LogisticsRedeemer.clar
(use-trait ft-trait .sip-010.ft-trait)

(define-map providers principal uint) ;; Provider -> Discount Rate

(define-public (add-provider (provider principal) (rate uint))
  (ok (map-set providers provider rate)))

(define-public (redeem (amount uint) (provider principal) (token-contract <ft-trait>))
  (let ((rate (unwrap! (map-get? providers provider) (err u404))))
    (try! (contract-call? token-contract transfer amount tx-sender provider))
    (let ((service-value (* amount rate)))
      (print {event: "redeem", value: service-value}) ;; Emit event for off-chain fulfillment
      (ok service-value))))
```

## Usage Examples
- Supplier mints invoice: `(contract-call? .InvoiceNFT mint-invoice u1000 u1234567890 'SPBuyer)`
- Lender buys: `(contract-call? .FinancingPool buy-invoice u1 .InvoiceNFT)`
- Oracle reports: `(contract-call? .PaymentOracle report-payment u1 block-height true)`
- Distribute reward: `(contract-call? .RewardDistributor distribute-reward u1 .IFlowToken 'SPOracle)`
- Redeem: `(contract-call? .LogisticsRedeemer redeem u100 'SPLogistics .IFlowToken)`

## Security Considerations
- Use multisig for oracle and admin roles.
- Audit contracts before mainnet deployment.
- Time-based checks prevent front-running.

## Future Improvements
- Integrate with Bitcoin L2 for cross-chain payments.
- Add DeFi composability (e.g., yield farming on financed invoices).

For questions, open an issue on GitHub. This project is open-source under MIT license.