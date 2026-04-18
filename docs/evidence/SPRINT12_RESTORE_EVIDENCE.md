# Evidência — Teste de Restore Sprint 12

## Comando executado

```bash
./scripts/backup-restore-drill.sh
```

## Saída observada

```text
Restore drill OK
workdir=/tmp/applandlord-backup-drill
backup_file=/tmp/applandlord-backup-drill/snapshot.json.gz
sha256=eaf4b96e2c8298fdf10b08f8196b6402224d0ab9f2d36e1108fa2b63902a36a8
```

## Critério de aceite
- [x] Backup gerado.
- [x] Restore executado.
- [x] Checksum de integridade idêntico entre snapshot original e restaurado.
