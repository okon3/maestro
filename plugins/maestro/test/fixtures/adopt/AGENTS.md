# Contesto operativo non deducibile dal codice

## Vincoli e priorita

- Verifiche standard dopo modifiche TypeScript: `npm test`, `npm run lint` e `npm run build`.
- Dopo ogni feature applicativa, incaricare un subagent di avviare la build con `agent-browser` in modalita headed e testare la feature come utente.
- Tenere aggiornato `PLAN.md` nello stesso commit quando cambiano stato, scope o priorita.

## Strategia multi-agent e controllo dei costi

- Usare SOL come agente principale per comprendere la richiesta.
- Delegare a subagent meno costosi attivita concrete e delimitate.

## Altro

- Una regola normale.
