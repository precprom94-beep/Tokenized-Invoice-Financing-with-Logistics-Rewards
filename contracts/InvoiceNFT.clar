(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-INVALID-DUE-DATE u102)
(define-constant ERR-INVALID-BUYER u103)
(define-constant ERR-INVOICE-ALREADY-EXISTS u104)
(define-constant ERR-INVOICE-NOT-FOUND u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u107)
(define-constant ERR-INVALID-DESCRIPTION u108)
(define-constant ERR-INVALID-CURRENCY u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-INVOICE-PAID u111)
(define-constant ERR-INVOICE_EXPIRED u112)
(define-constant ERR_INVALID_UPDATE_PARAM u113)
(define-constant ERR_MAX_INVOICES_EXCEEDED u114)
(define-constant ERR_INVALID_DISCOUNT_RATE u115)
(define-constant ERR_INVALID_PENALTY_RATE u116)
(define-constant ERR_INVALID_LOCATION u117)
(define-constant ERR_INVALID_TERMS u118)
(define-constant ERR_INVALID_QUANTITY u119)
(define-constant ERR_INVALID_PRICE u120)

(define-data-var next-invoice-id uint u0)
(define-data-var max-invoices uint u10000)
(define-data-var creation-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map invoices
  uint
  {
    amount: uint,
    due-date: uint,
    buyer: principal,
    supplier: principal,
    paid: bool,
    timestamp: uint,
    description: (string-utf8 500),
    currency: (string-utf8 10),
    status: (string-utf8 20),
    discount-rate: uint,
    penalty-rate: uint,
    location: (string-utf8 100),
    terms: (string-utf8 1000),
    quantity: uint,
    unit-price: uint
  }
)

(define-map invoices-by-supplier
  principal
  (list 100 uint)
)

(define-map invoice-updates
  uint
  {
    update-amount: uint,
    update-due-date: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-non-fungible-token invoice-nft uint)

(define-read-only (get-invoice (id uint))
  (map-get? invoices id)
)

(define-read-only (get-invoice-updates (id uint))
  (map-get? invoice-updates id)
)

(define-read-only (get-invoices-by-supplier (supplier principal))
  (default-to (list) (map-get? invoices-by-supplier supplier))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-due-date (due-date uint))
  (if (> due-date block-height)
      (ok true)
      (err ERR-INVALID-DUE-DATE))
)

(define-private (validate-buyer (buyer principal))
  (if (not (is-eq buyer tx-sender))
      (ok true)
      (err ERR-INVALID-BUYER))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-currency (cur (string-utf8 10)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD") (is-eq cur u"BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-discount-rate (rate uint))
  (if (<= rate u50)
      (ok true)
      (err ERR_INVALID_DISCOUNT_RATE))
)

(define-private (validate-penalty-rate (rate uint))
  (if (<= rate u100)
      (ok true)
      (err ERR_INVALID_PENALTY_RATE))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID_LOCATION))
)

(define-private (validate-terms (terms (string-utf8 1000)))
  (if (<= (len terms) u1000)
      (ok true)
      (err ERR-INVALID_TERMS))
)

(define-private (validate-quantity (qty uint))
  (if (> qty u0)
      (ok true)
      (err ERR-INVALID_QUANTITY))
)

(define-private (validate-unit-price (price uint))
  (if (> price u0)
      (ok true)
      (err ERR-INVALID_PRICE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-invoices (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR_MAX_INVOICES_EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-invoices new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR_INVALID_UPDATE_PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (mint-invoice
  (amount uint)
  (due-date uint)
  (buyer principal)
  (description (string-utf8 500))
  (currency (string-utf8 10))
  (discount-rate uint)
  (penalty-rate uint)
  (location (string-utf8 100))
  (terms (string-utf8 1000))
  (quantity uint)
  (unit-price uint)
)
  (let (
        (next-id (+ (var-get next-invoice-id) u1))
        (current-max (var-get max-invoices))
        (authority (var-get authority-contract))
        (supplier tx-sender)
      )
    (asserts! (< (var-get next-invoice-id) current-max) (err ERR_MAX_INVOICES_EXCEEDED))
    (try! (validate-amount amount))
    (try! (validate-due-date due-date))
    (try! (validate-buyer buyer))
    (try! (validate-description description))
    (try! (validate-currency currency))
    (try! (validate-discount-rate discount-rate))
    (try! (validate-penalty-rate penalty-rate))
    (try! (validate-location location))
    (try! (validate-terms terms))
    (try! (validate-quantity quantity))
    (try! (validate-unit-price unit-price))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get creation-fee) tx-sender authority-recipient))
    )
    (try! (nft-mint? invoice-nft next-id supplier))
    (map-set invoices next-id
      {
        amount: amount,
        due-date: due-date,
        buyer: buyer,
        supplier: supplier,
        paid: false,
        timestamp: block-height,
        description: description,
        currency: currency,
        status: u"pending",
        discount-rate: discount-rate,
        penalty-rate: penalty-rate,
        location: location,
        terms: terms,
        quantity: quantity,
        unit-price: unit-price
      }
    )
    (map-set invoices-by-supplier supplier
      (unwrap! (as-max-len? (append (get-invoices-by-supplier supplier) next-id) u100) (err ERR_MAX_INVOICES_EXCEEDED))
    )
    (var-set next-invoice-id next-id)
    (print { event: "invoice-minted", id: next-id })
    (ok next-id)
  )
)

(define-public (transfer (id uint) (recipient principal))
  (let ((invoice (unwrap! (map-get? invoices id) (err ERR-INVOICE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get supplier invoice)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get paid invoice)) (err ERR-INVOICE_PAID))
    (asserts! (< block-height (get due-date invoice)) (err ERR_INVOICE_EXPIRED))
    (try! (nft-transfer? invoice-nft id tx-sender recipient))
    (map-set invoices id
      (merge invoice { supplier: recipient })
    )
    (ok true)
  )
)

(define-public (mark-paid (id uint))
  (let ((invoice (unwrap! (map-get? invoices id) (err ERR-INVOICE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get buyer invoice)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get paid invoice)) (err ERR_INVOICE_PAID))
    (map-set invoices id
      (merge invoice { paid: true, status: u"paid" })
    )
    (print { event: "invoice-paid", id: id })
    (ok true)
  )
)

(define-public (update-invoice
  (id uint)
  (new-amount uint)
  (new-due-date uint)
)
  (let ((invoice (unwrap! (map-get? invoices id) (err ERR-INVOICE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get supplier invoice)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get paid invoice)) (err ERR_INVOICE_PAID))
    (try! (validate-amount new-amount))
    (try! (validate-due-date new-due-date))
    (map-set invoices id
      (merge invoice
        {
          amount: new-amount,
          due-date: new-due-date,
          timestamp: block-height
        }
      )
    )
    (map-set invoice-updates id
      {
        update-amount: new-amount,
        update-due-date: new-due-date,
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "invoice-updated", id: id })
    (ok true)
  )
)

(define-public (burn-invoice (id uint))
  (let ((invoice (unwrap! (map-get? invoices id) (err ERR-INVOICE-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get supplier invoice)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get paid invoice)) (err ERR_INVOICE_PAID))
    (try! (nft-burn? invoice-nft id tx-sender))
    (map-delete invoices id)
    (map-delete invoice-updates id)
    (print { event: "invoice-burned", id: id })
    (ok true)
  )
)

(define-public (get-invoice-count)
  (ok (var-get next-invoice-id))
)