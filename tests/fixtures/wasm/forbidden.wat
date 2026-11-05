;; Imports a function the host ABI does not have (env.fetch_url): refused before instantiation
(module
  (import "env" "fetch_url" (func $fetch (param i32 i32)))
  (memory (export "memory") 1 2)
  (func (export "step") (param i32 i32 i32 i32)
    i32.const 0 i32.const 0 call $fetch)
)
