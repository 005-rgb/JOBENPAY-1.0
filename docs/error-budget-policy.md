# Error Budget Policy

## Tujuan
Mendefinisikan apa yang terjadi ketika Error Budget habis.

## Aturan
1. **Jika Error Budget > 50%:** Normal operations.
2. **Jika Error Budget 10-50%:** Warning. Review SLO, identifikasi penyebab.
3. **Jika Error Budget < 10%:** Freeze fitur baru. Fokus pada perbaikan keandalan.
4. **Jika Error Budget habis (0%):** Freeze total. Hanya perbaikan bug dan keandalan.
5. **Jika double payout terjadi:** Error Budget dianggap habis, terlepas dari persentase.

## Proses
- Review mingguan: tim engineering + product.
- Keputusan freeze: oleh Engineering Lead.
- Unfreeze: setelah 2 minggu tanpa insiden kritis.
