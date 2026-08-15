(ns deep-saude-backend.ci-probe-test
  (:require [clojure.test :refer :all]))

;; Sonda temporária, deliberadamente vermelha, para provar que o workflow
;; bloqueia uma regressão. Será removida assim que a falha aparecer no Actions.
(deftest ci-reprova-teste-quebrado
  (is false "falha deliberada da sonda do CI"))
