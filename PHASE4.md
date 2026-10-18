# Fase 4 — Início, fluxo de caixa e orçamento

## Funcionalidades entregues

- Início com seleção de mês/moeda, receitas e despesas realizadas, agendadas e previstas, total projetado, saldos atuais e projetados por conta, próximos lançamentos, despesas por categoria e indicadores de orçamento.
- Acesso rápido para adicionar receita, despesa ou transferência, já com o tipo selecionado.
- Fluxo de caixa em `/fluxo-de-caixa`: filtros por período, moeda e conta, saldos iniciais/finais realizados e projetados, gráfico e movimentos diários separados por estado. Transferências internas se anulam no consolidado e aparecem pelo efeito líquido quando uma conta é selecionada.
- Orçamento em `/orcamento`: limites mensais por categoria de despesa, criação, edição, remoção com confirmação, navegação mensal, valor utilizado/restante, percentual e alertas.
- Todas as previsões reutilizam as recorrências existentes sem gravar ocorrências durante a consulta. Confirmar ou editar uma ocorrência mantém uma única contribuição financeira. Pausa, encerramento, marcadores de exclusão e preservação de histórico continuam respeitados.
- Categorias arquivadas continuam presentes no histórico e nos limites existentes, mas não podem ser escolhidas para novos limites. Categorias vinculadas a orçamentos ou recorrências não podem ser apagadas fisicamente.
- Sem nova dependência, backend, cadastro, sincronização ou alteração de versão do banco local.

## Arquivos novos

- `src/domain/planning.ts`: períodos, mesclagem de previsões, resumos, despesas por categoria, orçamento e fluxo de caixa.
- `src/data/planning.ts`: leitura local consistente e somente leitura.
- `src/data/budgets.ts`: persistência e validação atômica de limites.
- `src/routes/orcamento.tsx`, `src/routes/fluxo-de-caixa.tsx`.
- `src/ui/PlanningControls.tsx`, `src/ui/BudgetDialog.tsx`, `src/ui/BudgetMeter.tsx`, `src/ui/CashFlowChart.tsx`.
- `src/domain/__tests__/planning.test.ts`, `src/data/__tests__/phase4.test.ts`.
- `PHASE4.md`.

## Arquivos atualizados

- `src/routes/index.tsx`: resumo completo e atalhos.
- `src/routes/planejamento.tsx`: acessos às novas páginas, substituindo os avisos de fase futura.
- `src/ui/EntryContext.tsx`: abertura de novo lançamento com tipo preselecionado.
- `src/ui/AppShell.tsx`: contenção de largura para telas pequenas.
- `src/data/categories.ts`: proteção contra exclusão de categorias com limites ou recorrências.
- `src/styles.css`: indicadores de orçamento e espaçamento de letras.
- `AGENTS.md`, `roadmap.md`: regras estruturais e estado da entrega.

## Testes e verificações

- `npm test`: **69 testes passaram em 9 arquivos**. São 47 anteriores e 22 novos, incluindo estado efetivo, moeda, categoria, período, virada de ano, fevereiro bissexto, saldo inicial/final, transferências, empréstimos/pagamentos como operações separadas, recorrências movidas, pausa/encerramento, marcadores, limites, categoria arquivada, concorrência, persistência e exclusão.
- `npm run lint`: **0 erros, 9 avisos preexistentes** de Fast Refresh. Nenhum aviso novo.
- `npm run build`: **não executado manualmente**, conforme a regra da plataforma; a validação automática mais recente registrou **build OK**, incluindo a verificação de tipos.
- Fluxo real validado em navegador: conta com R$ 1.000,00, despesa realizada de R$ 100,00 e recorrência prevista de R$ 200,00. Início e fluxo mostraram saldo realizado de **R$ 900,00** e projetado de **R$ 700,00**. A confirmação futura mudou o estado para **Agendado**, sem alterar o realizado nem duplicar a projeção.
- Limite de R$ 120,00 mostrou 83% e R$ 20,00 restantes; edição para R$ 80,00 mostrou 125% e -R$ 20,00 restantes. Recarregar preservou o limite; navegar para outro mês não trouxe o limite anterior; cancelar a remoção preservou-o e confirmar a remoção permaneceu efetivo após recarregar.
- Verificadas as três páginas em 1280 × 1800 e 390 × 844, com gráfico visível, sem transbordamento horizontal da página e sem erros de execução. A tabela detalhada tem rolagem horizontal própria em telas pequenas.

## Decisões e limites conhecidos

- **Próximo do limite** significa 80% ou mais; 100% é limite atingido e acima de 100% é excesso. Percentuais são truncados para inteiros; dinheiro continua exato em centavos.
- O índice existente permite **um limite por categoria/mês**, não um limite para cada moeda dentro da mesma categoria/mês. Moedas não são convertidas nem somadas entre si.
- A consulta de fluxo usa uma janela finita de até cinco anos civis para evitar consultas ilimitadas. A tela de recorrências mantém a janela anterior de três meses; nas novas consultas, previsões são calculadas no período escolhido, sem materialização nem mudança de regras de recorrência.
- A projeção considera lançamentos armazenados anteriores ao início do período e previsões virtuais dentro da janela consultada. Não inventa confirmação nem materializa previsões históricas anteriores à janela. Saldos iniciais projetados e realizados podem diferir.
- O saldo atual no Início permanece referente a hoje. Ao selecionar um mês passado, o segundo indicador é explicitamente identificado como **Saldo no fim do mês (inclui previstos)**, com a data exibida, não como saldo atual.
- Contas arquivadas ficam fora do consolidado de contas ativas, preservando a regra existente, mas podem ser selecionadas individualmente no fluxo.
- Operações dedicadas de dívida já existentes no modelo têm seu efeito de caixa separado de receitas/despesas. Cadastro de dívidas, alocação de juros/principal, patrimônio e metas continuam na Fase 5.
- Persistência local foi validada. Instalação PWA, cache offline completo, backup/restauração e importação continuam nas fases previstas; não foram antecipados nesta entrega.

## Validação manual

1. Cadastre uma conta com saldo de R$ 1.000,00 em Mais → Contas.
2. No Início, adicione uma despesa realizada de R$ 100,00 em Alimentação. O saldo atual deve ser R$ 900,00.
3. Em Planejamento → Recorrentes, crie uma despesa de R$ 200,00 com vencimento futuro no mesmo mês. O projetado deve ser R$ 700,00; confirmar a ocorrência futura deve mostrar Agendado sem reduzir o saldo atual.
4. Em Orçamento, defina Alimentação com limite R$ 120,00. Confira R$ 100,00 utilizados, R$ 20,00 restantes e 83%. Edite para R$ 80,00 e confira 125% e -R$ 20,00.
5. Recarregue e alterne entre meses. O limite deve permanecer apenas no mês cadastrado. Cancele uma remoção e depois confirme-a; os lançamentos não devem desaparecer.
6. Em Fluxo de caixa, altere período e conta. Confira os saldos e os estados. Com duas contas, registre uma transferência e confirme que ela não aumenta receitas ou despesas consolidadas.
7. Pause/retome uma recorrência e confira as previsões. Ao excluir somente a regra, confirme que o histórico realizado permanece.

**Fase 5 não iniciada; aguarda autorização explícita.**