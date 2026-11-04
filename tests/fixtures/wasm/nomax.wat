;; Defines its memory without a maximum (it could grow without bound): refused
(module
  (memory (export "memory") 1)
  (func (export "step") (param i32 i32 i32 i32))
)
