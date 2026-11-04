;; Imports noema_now with the wrong signature (result i32 instead of f64): refused
(module
  (import "noema" "noema_now" (func $now (result i32)))
  (memory (export "memory") 1 2)
  (func (export "step") (param i32 i32 i32 i32))
)
