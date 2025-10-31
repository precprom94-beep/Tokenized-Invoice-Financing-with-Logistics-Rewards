(define-constant ERR-NOT-AUTHORIZED u403)
(define-constant ERR-INVALID-INVOICE-ID u404)
(define-constant ERR-INVALID-TIMESTAMP u405)
(define-constant ERR-INVALID-AMOUNT u406)
(define-constant ERR-INVALID-CURRENCY u407)
(define-constant ERR-INVALID-EARLY_FLAG u408)
(define-constant ERR-ORACLE-ALREADY-EXISTS u409)
(define-constant ERR-ORACLE-NOT-FOUND u410)
(define-constant ERR-PAYMENT-ALREADY_VERIFIED u411)
(define-constant ERR-INVALID-GRACE-PERIOD u412)
(define-constant ERR-INVALID-INTEREST_RATE u413)
(define-constant ERR-INVALID-PENALTY u414)
(define-constant ERR-MAX-ORACLES_EXCEEDED u415)
(define-constant ERR-INVALID-UPDATE_PARAM u416)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u417)
(define-constant ERR-INVALID-LOCATION u418)
(define-constant ERR-INVALID-STATUS u419)
(define-constant ERR-INVALID-VOTING_THRESHOLD u420)
(define-constant ERR-INVALID-MAX_REPORTS u421)

(define-data-var admin principal tx-sender)
(define-data-var next-oracle-id uint u0)
(define-data-var max-oracles uint u50)
(define-data-var report-fee uint u100)
(define-data-var authority-contract (optional principal) none)
(define-data-var max-reports-per-invoice uint u5)

(define-map oracles
  uint
  {
    oracle-principal: principal,
    name: (string-utf8 50),
    location: (string-utf8 100),
    status: bool,
    timestamp: uint,
    voting-threshold: uint,
    grace-period: uint,
    interest-rate: uint,
    penalty: uint
  }
)

(define-map oracles-by-name
  (string-utf8 50)
  uint)

(define-map verified-payments
  uint
  {
    invoice-id: uint,
    timestamp: uint,
    amount: uint,
    currency: (string-utf8 20),
    early: bool,
    reporter: principal,
    status: bool,
    grace-period: uint,
    interest-rate: uint,
    penalty: uint
  }
)

(define-map payment-reports
  uint
  (list 10 uint))

(define-read-only (get-oracle (id uint))
  (map-get? oracles id)
)

(define-read-only (get-payment (invoice-id uint))
  (map-get? verified-payments invoice-id)
)

(define-read-only (get-payment-reports (invoice-id uint))
  (map-get? payment-reports invoice-id)
)

(define-read-only (is-oracle-registered (name (string-utf8 50)))
  (is-some (map-get? oracles-by-name name))
)

(define-private (validate-name (name (string-utf8 50)))
  (if (and (> (len name) u0) (<= (len name) u50))
      (ok true)
      (err ERR-INVALID_UPDATE_PARAM))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID_TIMESTAMP))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID_AMOUNT))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID_CURRENCY))
)

(define-private (validate-early (early bool))
  (ok true)
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID_LOCATION))
)

(define-private (validate-status (status bool))
  (ok true)
)

(define-private (validate-voting-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100))
      (ok true)
      (err ERR-INVALID_VOTING_THRESHOLD))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u30)
      (ok true)
      (err ERR-INVALID_GRACE_PERIOD))
)

(define-private (validate-interest-rate (rate uint))
  (if (<= rate u20)
      (ok true)
      (err ERR-INVALID_INTEREST_RATE))
)

(define-private (validate-penalty (penalty uint))
  (if (<= penalty u100)
      (ok true)
      (err ERR-INVALID_PENALTY))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (var-get authority-contract)) (err ERR_AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-oracles (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID_UPDATE_PARAM))
    (var-set max-oracles new-max)
    (ok true)
  )
)

(define-public (set-report-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID_UPDATE_PARAM))
    (var-set report-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-reports-per-invoice (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR_INVALID_MAX_REPORTS))
    (var-set max-reports-per-invoice new-max)
    (ok true)
  )
)

(define-public (register-oracle
  (name (string-utf8 50))
  (location (string-utf8 100))
  (voting-threshold uint)
  (grace-period uint)
  (interest-rate uint)
  (penalty uint)
)
  (let (
        (next-id (var-get next-oracle-id))
        (current-max (var-get max-oracles))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ORACLES_EXCEEDED))
    (try! (validate-name name))
    (try! (validate-location location))
    (try! (validate-voting-threshold voting-threshold))
    (try! (validate-grace-period grace-period))
    (try! (validate-interest-rate interest-rate))
    (try! (validate-penalty penalty))
    (asserts! (is-none (map-get? oracles-by-name name)) (err ERR_ORACLE_ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR_AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get report-fee) tx-sender authority-recipient))
    )
    (map-set oracles next-id
      {
        oracle-principal: tx-sender,
        name: name,
        location: location,
        status: true,
        timestamp: block-height,
        voting-threshold: voting-threshold,
        grace-period: grace-period,
        interest-rate: interest-rate,
        penalty: penalty
      }
    )
    (map-set oracles-by-name name next-id)
    (var-set next-oracle-id (+ next-id u1))
    (print { event: "oracle-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-oracle
  (oracle-id uint)
  (update-name (string-utf8 50))
  (update-location (string-utf8 100))
  (update-voting-threshold uint)
)
  (let ((oracle (map-get? oracles oracle-id)))
    (match oracle
      o
        (begin
          (asserts! (is-eq (get oracle-principal o) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-name update-name))
          (try! (validate-location update-location))
          (try! (validate-voting-threshold update-voting-threshold))
          (let ((existing (map-get? oracles-by-name update-name)))
            (match existing
              existing-id
                (asserts! (is-eq existing-id oracle-id) (err ERR_ORACLE_ALREADY-EXISTS))
              (begin true)
            )
          )
          (let ((old-name (get name o)))
            (if (is-eq old-name update-name)
                (ok true)
                (begin
                  (map-delete oracles-by-name old-name)
                  (map-set oracles-by-name update-name oracle-id)
                  (ok true)
                )
            )
          )
          (map-set oracles oracle-id
            {
              oracle-principal: (get oracle-principal o),
              name: update-name,
              location: update-location,
              status: (get status o),
              timestamp: block-height,
              voting-threshold: update-voting-threshold,
              grace-period: (get grace-period o),
              interest-rate: (get interest-rate o),
              penalty: (get penalty o)
            }
          )
          (print { event: "oracle-updated", id: oracle-id })
          (ok true)
        )
      (err ERR_ORACLE_NOT_FOUND)
    )
  )
)

(define-public (report-payment
  (invoice-id uint)
  (timestamp uint)
  (amount uint)
  (currency (string-utf8 20))
  (early bool)
  (grace-period uint)
  (interest-rate uint)
  (penalty uint)
)
  (let (
        (oracle-id-opt (map-get? oracles-by-name (as-contract tx-sender)))
        (reports (default-to (list) (map-get? payment-reports invoice-id)))
      )
    (asserts! (is-some oracle-id-opt) (err ERR_NOT-AUTHORIZED))
    (try! (validate-timestamp timestamp))
    (try! (validate-amount amount))
    (try! (validate-currency currency))
    (try! (validate-early early))
    (try! (validate-grace-period grace-period))
    (try! (validate-interest-rate interest-rate))
    (try! (validate-penalty penalty))
    (asserts! (is-none (map-get? verified-payments invoice-id)) (err ERR_PAYMENT_ALREADY_VERIFIED))
    (asserts! (< (len reports) (var-get max-reports-per-invoice)) (err ERR_INVALID_MAX_REPORTS))
    (map-set verified-payments invoice-id
      {
        invoice-id: invoice-id,
        timestamp: timestamp,
        amount: amount,
        currency: currency,
        early: early,
        reporter: tx-sender,
        status: true,
        grace-period: grace-period,
        interest-rate: interest-rate,
        penalty: penalty
      }
    )
    (map-set payment-reports invoice-id (append reports invoice-id))
    (print { event: "payment-reported", invoice-id: invoice-id })
    (ok true)
  )
)

(define-public (get-oracle-count)
  (ok (var-get next-oracle-id))
)

(define-public (check-oracle-existence (name (string-utf8 50)))
  (ok (is-oracle-registered name))
)