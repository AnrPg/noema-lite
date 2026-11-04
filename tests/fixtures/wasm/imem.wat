;; Imported memory without a maximum (the host caps it at abi.maxPages) · step: out[0] = the sum of the inputs · grow(n): memory.grow
(module
  (import "noema" "memory" (memory 1))
  (import "noema" "noema_now" (func $now (result f64)))
  (func (export "step") (param $pin i32) (param $nin i32) (param $pout i32) (param $nout i32)
    (local $i i32) (local $s f64)
    block $done
      loop $next
        local.get $i local.get $nin i32.ge_s br_if $done
        local.get $pin local.get $i i32.const 3 i32.shl i32.add f64.load
        local.get $s f64.add local.set $s
        local.get $i i32.const 1 i32.add local.set $i
        br $next
      end
    end
    local.get $pout local.get $s f64.store)
  (func (export "grow") (param $pages i32) (result i32)
    local.get $pages memory.grow)
)
