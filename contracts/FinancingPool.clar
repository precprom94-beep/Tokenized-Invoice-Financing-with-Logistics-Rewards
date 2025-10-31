(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRICE u101)
(define-constant ERR-INVALID-NFT-ID u102)
(define-constant ERR-INVALID-POOL-BALANCE u103)
(define-constant ERR-INVALID-INTEREST-RATE u104)
(define-constant ERR-INVALID-DURATION u105)
(define-constant ERR-LISTING-ALREADY-EXISTS u106)
(define-constant ERR-LISTING-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-POOL-NOT-VERIFIED u109)
(define-constant ERR-INVALID-MIN-PRICE u110)
(define-constant ERR-INVALID-MAX-BID u111)
(define-constant ERR-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-LISTINGS-EXCEEDED u114)
(define-constant ERR-INVALID-LISTING-TYPE u115)
(define-constant ERR-INVALID-FEE-RATE u116)
(define-constant ERR-INVALID-OWNER u117)
(define-constant ERR-INVALID-BIDDER u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-listing-id uint u0)
(define-data-var max-listings uint u1000)
(define-data-var pool-fee uint u100)
(define-data-var pool-admin (optional principal) none)

(define-map listings
  uint
  {
    nft-id: uint,
    price: uint,
    min-price: uint,
    seller: principal,
    timestamp: uint,
    duration: uint,
    interest-rate: uint,
    listing-type: (string-utf8 50),
    fee-rate: uint,
    owner: principal,
    currency: (string-utf8 20),
    status: bool,
    max-bid: uint
  }
)

(define-map listings-by-nft uint uint)

(define-map listing-updates
  uint
  {
    update-price: uint,
    update-min-price: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-map bids
  { listing-id: uint, bidder: principal }
  { bid-amount: uint, timestamp: uint }
)

(define-map pool-deposits principal uint)

(define-read-only (get-listing (id uint))
  (map-get? listings id)
)

(define-read-only (get-listing-updates (id uint))
  (map-get? listing-updates id)
)

(define-read-only (get-bid (listing-id uint) (bidder principal))
  (map-get? bids { listing-id: listing-id, bidder: bidder })
)

(define-read-only (get-pool-deposit (depositor principal))
  (map-get? pool-deposits depositor)
)

(define-read-only (is-listing-registered (nft-id uint))
  (is-some (map-get? listings-by-nft nft-id))
)

(define-private (validate-price (price uint))
  (if (> price u0) (ok true) (err ERR-INVALID-PRICE))
)

(define-private (validate-min-price (min uint))
  (if (> min u0) (ok true) (err ERR-INVALID-MIN-PRICE))
)

(define-private (validate-nft-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-NFT-ID))
)

(define-private (validate-duration (dur uint))
  (if (> dur u0) (ok true) (err ERR-INVALID-DURATION))
)

(define-private (validate-interest-rate (rate uint))
  (if (<= rate u20) (ok true) (err ERR-INVALID-INTEREST-RATE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height) (ok true) (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-listing-type (type (string-utf8 50)))
  (if (or (is-eq type "fixed") (is-eq type "auction"))
      (ok true)
      (err ERR-INVALID-LISTING-TYPE))
)

(define-private (validate-fee-rate (rate uint))
  (if (<= rate u10) (ok true) (err ERR-INVALID-FEE-RATE))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-max-bid (max uint))
  (if (> max u0) (ok true) (err ERR-INVALID-MAX-BID))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-pool-admin (admin-principal principal))
  (begin
    (try! (validate-principal admin-principal))
    (asserts! (is-none (var-get pool-admin)) (err ERR-POOL-NOT-VERIFIED))
    (var-set pool-admin (some admin-principal))
    (ok true)
  )
)

(define-public (set-max-listings (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get pool-admin)) (err ERR-POOL-NOT-VERIFIED))
    (var-set max-listings new-max)
    (ok true)
  )
)

(define-public (set-pool-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get pool-admin)) (err ERR-POOL-NOT-VERIFIED))
    (var-set pool-fee new-fee)
    (ok true)
  )
)

(define-public (deposit-to-pool (amount uint))
  (begin
    (asserts! (> amount u0) (err ERR-INVALID-POOL-BALANCE))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set pool-deposits
      tx-sender
      (+ (default-to u0 (map-get? pool-deposits tx-sender)) amount))
    (print { event: "pool-deposit", amount: amount, depositor: tx-sender })
    (ok true)
  )
)

(define-public (withdraw-from-pool (amount uint))
  (let ((balance (default-to u0 (map-get? pool-deposits tx-sender))))
    (asserts! (>= balance amount) (err ERR-INVALID-POOL-BALANCE))
    (try! (as-contract (stx-transfer? amount tx-sender tx-sender)))
    (map-set pool-deposits tx-sender (- balance amount))
    (print { event: "pool-withdraw", amount: amount, depositor: tx-sender })
    (ok true)
  )
)

(define-public (list-invoice
  (nft-id uint)
  (price uint)
  (min-price uint)
  (duration uint)
  (interest-rate uint)
  (listing-type (string-utf8 50))
  (fee-rate uint)
  (currency (string-utf8 20))
  (max-bid uint)
  (nft-contract <nft-trait>)
)
  (let (
        (next-id (var-get next-listing-id))
        (current-max (var-get max-listings))
        (admin (var-get pool-admin))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-LISTINGS-EXCEEDED))
    (try! (validate-nft-id nft-id))
    (try! (validate-price price))
    (try! (validate-min-price min-price))
    (try! (validate-duration duration))
    (try! (validate-interest-rate interest-rate))
    (try! (validate-listing-type listing-type))
    (try! (validate-fee-rate fee-rate))
    (try! (validate-currency currency))
    (try! (validate-max-bid max-bid))
    (asserts! (is-none (map-get? listings-by-nft nft-id)) (err ERR-LISTING-ALREADY-EXISTS))
    (let ((admin-recipient (unwrap! admin (err ERR-POOL-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get pool-fee) tx-sender admin-recipient))
    )
    (try! (contract-call? nft-contract transfer nft-id tx-sender (as-contract tx-sender)))
    (map-set listings next-id
      {
        nft-id: nft-id,
        price: price,
        min-price: min-price,
        seller: tx-sender,
        timestamp: block-height,
        duration: duration,
        interest-rate: interest-rate,
        listing-type: listing-type,
        fee-rate: fee-rate,
        owner: tx-sender,
        currency: currency,
        status: true,
        max-bid: max-bid
      }
    )
    (map-set listings-by-nft nft-id next-id)
    (var-set next-listing-id (+ next-id u1))
    (print { event: "invoice-listed", id: next-id })
    (ok next-id)
  )
)

(define-public (update-listing
  (listing-id uint)
  (update-price uint)
  (update-min-price uint)
)
  (let ((listing (map-get? listings listing-id)))
    (match listing
      l
        (begin
          (asserts! (is-eq (get seller l) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-price update-price))
          (try! (validate-min-price update-min-price))
          (map-set listings listing-id
            (merge l {
              price: update-price,
              min-price: update-min-price,
              timestamp: block-height
            })
          )
          (map-set listing-updates listing-id
            {
              update-price: update-price,
              update-min-price: update-min-price,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "listing-updated", id: listing-id })
          (ok true)
        )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (place-bid (listing-id uint) (bid-amount uint) (nft-contract <nft-trait>))
  (let ((listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND))))
    (asserts! (get status listing) (err ERR-INVALID-STATUS))
    (asserts! (<= bid-amount (get max-bid listing)) (err ERR-INVALID-MAX-BID))
    (asserts! (>= bid-amount (get min-price listing)) (err ERR-INVALID-MIN-PRICE))
    (try! (stx-transfer? bid-amount tx-sender (as-contract tx-sender)))
    (map-set bids { listing-id: listing-id, bidder: tx-sender }
      { bid-amount: bid-amount, timestamp: block-height }
    )
    (print { event: "bid-placed", listing-id: listing-id, bidder: tx-sender, amount: bid-amount })
    (ok true)
  )
)

(define-public (accept-bid (listing-id uint) (bidder principal) (nft-contract <nft-trait>))
  (let (
        (listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND)))
        (bid (unwrap! (map-get? bids { listing-id: listing-id, bidder: bidder }) (err ERR-INVALID-BIDDER)))
      )
    (asserts! (is-eq (get seller listing) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (as-contract (stx-transfer? (get bid-amount bid) tx-sender (get seller listing))))
    (try! (as-contract (contract-call? nft-contract transfer (get nft-id listing) tx-sender bidder)))
    (map-set listings listing-id (merge listing { status: false }))
    (map-delete bids { listing-id: listing-id, bidder: bidder })
    (print { event: "bid-accepted", listing-id: listing-id, bidder: bidder })
    (ok true)
  )
)

(define-public (get-listing-count)
  (ok (var-get next-listing-id))
)

(define-public (check-listing-existence (nft-id uint))
  (ok (is-listing-registered nft-id))
)

(define-trait nft-trait
  (
    (transfer (uint principal principal) (response bool uint))
  )
)