# Ajuste da Fase 3 — Exclusão segura de recorrências

## Comportamento

- A ação Excluir está disponível em regras ativas, pausadas e encerradas.
- A confirmação começa em **Excluir somente a regra**: remove a regra e os lançamentos vinculados previstos com data futura; preserva todos os confirmados, inclusive agendados e editados individualmente. Previstos com data passada ou de hoje também são preservados.
- **Excluir a regra e seu histórico** exige selecionar a opção, marcar uma confirmação explícita e clicar no botão destrutivo. Remove as ocorrências vinculadas, confirmadas ou previstas.
- Cancelar ou fechar a confirmação não grava alterações.
- Os lançamentos preservados tornam-se lançamentos comuns: perdem somente os campos de vínculo à recorrência, permanecendo editáveis e disponíveis nos saldos e resumos.
- Transferências e registros sem vínculo comprovado não são excluídos. Outras regras não são afetadas.
- Regra, lançamentos e marcadores de ocorrências ignoradas são tratados numa única transação local. Uma falha desfaz todas as alterações.
- Pausar e encerrar mantêm os comportamentos anteriores. Não houve alteração de esquema, dependências ou conexão a serviços externos.

## Arquivos alterados ou adicionados

- `src/data/recurring.ts`: operação de exclusão atômica, validação de confirmação e remoção de referências.
- `src/ui/DeleteRecurringRuleDialog.tsx`: opções de exclusão, aviso financeiro, confirmação explícita e cancelamento.
- `src/routes/planejamento.tsx`: ação Excluir para todos os estados e abertura da confirmação.
- `src/data/__tests__/recurring-deletion.test.ts`: seis testes de integridade, estados, saldos, resumos, persistência, proteção e reversão após falha.
- `src/test/recurring-deletion-dialog.test.tsx`: três testes de cancelamento, exclusão padrão e confirmação obrigatória.
- `AGENTS.md`: regra de arquitetura para exclusão atômica e preservação de referências.
- `roadmap.md`: ajuste concluído; demais fases continuam aguardando autorização.
- `PHASE3-DELETION.md`: este relatório.

## Verificações

- `npm test`: **47 testes passaram em 7 arquivos**, incluindo os testes anteriores das Fases 1, 2 e 3 e nove testes novos.
- `npm run lint`: **0 erros e 9 avisos preexistentes** sobre Fast Refresh em arquivos compartilhados. Nenhum aviso novo nos arquivos do ajuste.
- `npm run build`: não executado manualmente, pois a plataforma realiza a verificação automaticamente. A última verificação automática registrou **build OK**, sem erros de tipos.
- Fluxo real pela interface: criação de conta e duas regras, confirmação de lançamentos, cancelamento sem exclusão, exclusão somente da regra, preservação de saldo de R$ 800,00, exclusão explícita do histórico da segunda regra e saldo atualizado de R$ 900,00. Após recarregar, a primeira transação permaneceu em Lançamentos e a segunda desapareceu. **Nenhum erro de execução** na verificação final.

## Limites de escopo

- Fluxo de Caixa e relatórios avançados continuam reservados às fases futuras; os saldos e resumos mensais existentes foram verificados.
- Não foi iniciada a Fase 4. A planilha de referência da Fase 8 continua aguardando envio.