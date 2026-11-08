# Databricks Data Engineer Associate — Guia de Estudos em Português 🇧🇷

Material completo para a certificação **Databricks Certified Data Engineer Associate** (blueprint de agosto de 2026):

- 📚 **Conteúdo de estudo em PT-BR** — os 7 domínios oficiais, 30+ aulas com exemplos de código, pegadinhas e dicas de prova
- 📝 **235 questões em inglês** (como na prova): 145 práticas por domínio + 2 simulados completos de 45
- 🧠 **Site de estudos com revisão inteligente** — HTML + CSS + JavaScript puro, funciona até offline

> **Abra o site:** <https://diegocgribeiro.github.io/databricks-data-engineer-associate-ptbr/>
> (ou baixe o repositório e abra `site/index.html` direto no navegador)

---

## O site de estudos

| Recurso | O que faz |
| :--- | :--- |
| **Painel** | Estimativa de acerto na prova (ponderada pelos pesos oficiais), desempenho e cobertura por domínio, sequência de dias e o **próximo passo recomendado** |
| **Estudar** | Todas as aulas em PT-BR, com diagramas, índice lateral e marcação de "lida" |
| **Praticar** | Sessões filtradas por banco, domínio, dificuldade e situação (novas, erradas, marcadas…), com **correção imediata e explicação** |
| **Confiança** | Antes de responder, diga se tem certeza ou está chutando — acerto no chute volta para revisão |
| **Revisão inteligente** | Repetição espaçada (1, 3, 7, 16, 35 dias). Errou? A questão volta hoje |
| **Caderno de erros** | Toda questão errada fica guardada com a explicação até você acertar. Mostra a alternativa errada que você mais escolhe |
| **Pontos fracos** | Domínios abaixo de 70%, ordenados pelo impacto na nota, e as **aulas exatas para reestudar** |
| **Simulados** | 45 questões em 90 minutos, sem correção até entregar, com nota por domínio e plano de estudo. Inclui um simulado aleatório ponderado que prioriza o que você ainda não domina |
| **Aula ligada à questão** | Cada questão aponta para a aula em PT-BR que explica o assunto |
| **🌐 Traduzir** | Abre a questão no Google Tradutor quando você travar no inglês |
| **Anotações e ⭐** | Escreva notas pessoais e marque questões para revisar |
| **Backup** | Exporte/importe seu progresso (fica salvo só no seu navegador) |

Atalhos no quiz: `1`–`4` ou `A`–`D` escolhem, `Enter` responde/avança, `F` marca no simulado.

## Estrutura do repositório

```text
├── conteudo/                         # Material de estudo em PT-BR
│   ├── README.md                     # Visão geral da prova, pesos, plano de estudo
│   ├── 01-databricks-intelligence-platform/      (6 %)
│   ├── 02-data-ingestion-and-loading/            (21 %)
│   ├── 03-data-transformation-and-modeling/      (22 %)
│   ├── 04-working-with-lakeflow-jobs/            (16 %)
│   ├── 05-implementing-cicd/                     (10 %)
│   ├── 06-troubleshooting-monitoring-and-optimization/ (10 %)
│   ├── 07-governance-and-security/               (15 %)
│   └── recursos/                     # Dicas de prova, revisão final, links oficiais
├── questoes/                         # Questões em inglês
│   ├── praticas/                     # 145 questões por domínio (.md)
│   ├── simulado-1/  simulado-2/      # 2 simulados completos (.md)
│   └── json/                         # Banco de questões estruturado
├── site/                             # Site de estudos (HTML/CSS/JS puro)
│   ├── index.html  styles.css
│   ├── js/app.js  js/md.js
│   └── data/                         # Gerado por scripts/build.py
└── scripts/build.py                  # Regera site/data a partir de conteudo/ e questoes/json/
```

## Por onde começar

1. Leia a [visão geral da prova](conteudo/README.md)
2. No site, faça o **Diagnóstico (20 questões)** — o painel passa a mostrar seus pontos fracos
3. Estude os domínios na ordem, priorizando os de maior peso (Transformação 22 %, Ingestão 21 %, Jobs 16 %, Governança 15 %)
4. Depois de cada aula, pratique as questões dela (botão **Praticar** na própria aula)
5. Faça a **Revisão inteligente** todo dia e zere o **Caderno de erros**
6. Quando estiver com ≥ 70 % em todos os domínios, faça o **Simulado 1**; revise; depois o **Simulado 2**
7. Na manhã da prova, leia a [revisão final](conteudo/recursos/revisao-final.md)

## Sobre a prova (agosto de 2026)

| | |
| :--- | :--- |
| Questões | 45 pontuadas (+ até 10 não pontuadas), múltipla escolha |
| Tempo | 90 minutos |
| Resultado | Aprovado/reprovado (nota mínima não publicada) — mire em ≥ 70 % nos simulados |
| Idiomas | Inglês, japonês, português (BR), coreano |
| Custo | US$ 200 |

| Domínio | Peso |
| :--- | :---: |
| Databricks Intelligence Platform | 6 % |
| Data Ingestion and Loading | 21 % |
| Data Transformation and Modeling | 22 % |
| Working with Lakeflow Jobs | 16 % |
| Implementing CI/CD | 10 % |
| Troubleshooting, Monitoring, and Optimization | 10 % |
| Governance and Security | 15 % |

Fonte oficial: [exam guide de agosto de 2026 (PDF)](https://www.databricks.com/sites/default/files/2026-10/Databricks-Certified-Data-Engineer-Associate-Exam-Guide-August-2026.pdf).

## Atualizando os dados do site

Se você editar alguma aula em `conteudo/` ou o banco em `questoes/json/`, rode:

```bash
python scripts/build.py
```

Ele regenera `site/data/lessons.js` e `site/data/questions.js` e refaz o mapeamento questão → aula. Sem dependências além do Python 3.

## Créditos e licença

- Conteúdo original em inglês, questões e estrutura: **[Databricks Certification Study Guide](https://github.com/kengio/databricks-certification-study-guide)** de Suppaseth Charoenkarnka — licença MIT (veja `scripts/LICENSE-upstream.txt`)
- Tradução para PT-BR, adaptações e o site de estudos: este repositório, também sob licença MIT ([LICENSE](LICENSE))
- Material de estudo independente — **não é oficial nem afiliado à Databricks**. Confira sempre a [documentação oficial](https://docs.databricks.com/)
