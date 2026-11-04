;; Declares a memory maximum of 65536 pages (4 GiB), over the limit: refused
(module
  (memory (export "memory") 1 65536)
  (func (export "step") (param i32 i32 i32 i32))
)
