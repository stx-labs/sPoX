;; title: registry
;; version: 1
;; summary: On-chain registry of sBTC deposit addresses for spox monitoring

;; constants
;;
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))

;; data vars
;;
(define-data-var next-address-id uint u0)

;; data maps
;;
(define-map deposit-address
  uint
  {
    deposit-script: (buff 196),
    reclaim-script: (buff 2048),
  }
)

;; public functions
;;

(define-public (register-address
    (deposit-script (buff 196))
    (reclaim-script (buff 2048))
  )
  (let ((id (var-get next-address-id)))
    (map-set deposit-address id {
      deposit-script: deposit-script,
      reclaim-script: reclaim-script,
    })
    (var-set next-address-id (+ id u1))
    (ok id)
  )
)

(define-public (remove-addresses (address-ids (list 4000 uint)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (ok (map remove-single-address address-ids))
  )
)

;; read only functions
;;

(define-read-only (get-next-address-id)
  (var-get next-address-id)
)

(define-read-only (get-addresses (address-ids (list 400 uint)))
  (map get-single-address address-ids)
)

;; private functions
;;

(define-private (get-single-address (id uint))
  (match (map-get? deposit-address id)
    entry (some (merge entry { id: id }))
    none
  )
)

(define-private (remove-single-address (id uint))
  (map-delete deposit-address id)
)
