# Sprint 12 — Checklist de Segurança (preenchida)

- [x] Validações backend reforçadas para login e job operacional.
- [x] Rate limit aplicado em endpoints críticos (`/api/auth/login`, `/api/whatsapp/webhook`, `/api/jobs/reminders/daily`).
- [x] Logs estruturados com redaction de segredos implementados.
- [x] Teste de backup/restore executado com validação de checksum.
- [x] Revisão de segredos obrigatórios (`AUTH_SECRET`, `WHATSAPP_WEBHOOK_SECRET`, `REMINDER_JOB_SECRET`).
- [x] Contratos de erro atualizados em documentação técnica.
- [x] Evidências anexadas em `docs/evidence/SPRINT12_RESTORE_EVIDENCE.md`.
