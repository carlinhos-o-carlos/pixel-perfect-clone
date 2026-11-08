# Fase 5 — Correção do saldo das dívidas

## Resultado

O principal de pagamentos confirmados na data do saldo inicial agora reduz a dívida. R$ 5.000 menos R$ 500, R$ 300 e R$ 300 resulta em R$ 3.900. Pendentes não reduzem a dívida; classificação modifica a mesma transação, remove a compensação pendente do patrimônio e desconta apenas o principal. Juros e encargos não amortizam o principal.

Saldos reconciliados representam o saldo após todos os pagamentos até a data de referência, inclusive na mesma data. Esses pagamentos não são descontados novamente, mesmo se forem classificados depois. Pagamentos posteriores continuam amortizando normalmente. Saldos e pagamentos futuros não entram no saldo atual antes de suas datas.

## Arquivos modificados

- `src/domain/types.ts`: proveniência opcional de saldos: inicial, reconciliado ou legado.
- `src/domain/wealth.ts`: cálculo com limite inclusivo para saldo inicial, exclusivo para reconciliado/legado, e filtro de referências futuras. O patrimônio usa esse mesmo cálculo.
- `src/data/db.ts`: versão 4, migração exclusivamente de metadados, preservando IDs, valores, datas e quantidades de registros; atualização da versão nas configurações.
- `src/data/wealth.ts`: criação identifica saldo inicial; atualização e quitação identificam saldo reconciliado. Reenvios de pagamentos validam tipo, dívida, conta, data e valor; composição enviada também deve corresponder quando presente. Classificações idênticas repetidas são operações sem escrita; alterações conflitantes são rejeitadas.
- `src/routes/mais.dividas.tsx`: identifica saldo inicial/reconciliado no histórico e substitui acessos sem verificação nos três callbacks envolvidos por verificações explícitas.
- `src/data/__tests__/debt-balance-correction.test.ts`: dez testes financeiros, de concorrência, persistência e migração.
- `src/data/__tests__/phase3.test.ts`: expectativa de versão atualizada para 4 na migração completa desde v1; proteção do índice único mantida.
- `AGENTS.md`: regras arquiteturais atualizadas para referências e reenvios.
- `roadmap.md`: correção registrada e concluída, fases seguintes ainda aguardam autorização.
- `PHASE5-DEBT-CORRECTION.md`: este relatório. Memória do projeto registra as restrições financeiras autorizadas.

## Interpretação dos dados antigos e migração

É necessária a migração local do IndexedDB para versão 4, executada automaticamente ao abrir o aplicativo atualizado; versões 1, 2 e 3 não foram reescritas.

Para cada dívida, somente o primeiro registro por data/hora de criação, se único nesse instante, sem observação e coincidente com a data e o valor de abertura, é identificado como inicial. Essa regra cobre tanto a criação da Fase 5 quanto o histórico de abertura gerado pela migração v3. Se a identificação é ambígua (por exemplo, dois registros no primeiro instante), nenhum deles é presumido inicial: referências legadas conservam a interpretação reconciliada anterior. Valores, datas, IDs, pagamentos e históricos nunca são apagados ou recriados. Dívidas sem histórico usam os próprios campos de abertura como referência inicial, sem inserir registros durante o cálculo.

O cadastro específico no dispositivo do usuário não foi inspecionado; a validação utilizou dados sintéticos em bancos isolados. Históricos ambíguos não são corrigidos por suposição. A migração não procura nem apaga eventuais pagamentos duplicados preexistentes.

Reenvio significa repetir o mesmo identificador de solicitação. Dois pagamentos novos e intencionais, mesmo com valor/data iguais, permanecem distintos; deduplicá-los automaticamente apagaria operações legítimas. O formulário mantém o identificador enquanto o pagamento está aberto. Após fechar e abrir um novo formulário, trata-se de uma nova operação, não de um reenvio.

## Validação

- **94 testes aprovados em 11 arquivos**, incluindo os dez novos testes; a execução final ocorreu após as correções de formatação.
- Cobertura: R$ 3.900 na abertura, pendente/classificação única e patrimônio antes/depois, juros/encargos, saldo manual na mesma data, classificação posterior ao saldo manual, principal posterior, reenvios concorrentes, conflitos, pagamentos futuros, referências futuras, reabertura do IndexedDB e migração v3→v4 sem perda de registros. As suítes existentes continuam cobrindo migrações desde v1/v2 e demais funcionalidades.
- **Lint: zero erros; nove avisos preexistentes** sobre exportações de componentes.
- **Compilação automática: `build OK`**, com verificação de tipos aprovada. Não foi executado `bun run build` manualmente, pois o ambiente realiza a compilação e a verificação de tipos automaticamente.
- **Fluxo pela interface em Chromium, 1280×1800**: criação de conta e dívida; três pagamentos no dia inicial → R$ 3.900; pendente de R$ 100 não altera esse saldo; classificação R$ 80 principal + R$ 15 juros + R$ 5 encargos → R$ 3.820; recarregamento mantém R$ 3.820; saldo reconciliado de R$ 3.820 na mesma data não duplica amortizações. Histórico preserva quatro pagamentos e duas referências. Nenhum erro de execução observado.

## Limites

Não houve publicação/deploy, início da Fase 6, alteração de valores financeiros existentes, exclusão/recriação de dívidas ou pagamentos. A migração preserva referências cuja origem não pode ser determinada com segurança, em vez de arriscar amortização duplicada.