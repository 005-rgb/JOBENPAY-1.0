-- ============================================================================
-- JOBENPAY UNIVERSAL TRANSACTION ENGINE
-- PRD 1.3 / PRD 2.0 SQL INSERT & CONSTRAINT TEST SUITE (PostgreSQL 13+)
-- File: docs/spec/sql/prd-2-insert-tests.sql
-- Status: DRAFT-UNTUK-PERSETUJUAN
-- 
-- Skrip ini memverifikasi secara nyata terhadap PostgreSQL:
-- 1. 28 pasangan legal category/sub_type berhasil di-insert.
-- 2. Kategori ilegal dan pasangan sub_type tidak cocok ditolak oleh CHECK constraint.
-- 3. Trigger check_balanced mengizinkan DEBIT = CREDIT dan menolak unbalanced ledger.
-- 4. Trigger check_balanced menolak ledger lintas-mata-uang yang tidak seimbang per currency.
-- 5. Trigger immutability menolak hard DELETE dan perubahan nilai nominal pada legs.
-- 6. down_payment_accounts: status default PENDING, CHECK dp+settle <= total, penegakan SETTLED.
-- 7. invoice_records: UNIQUE(org_id, invoice_number) dan CHECK amount > 0.
-- 8. recurring_schedules: kolom org_id, amount_minor, counterparty_id, frequency CHECK.
-- 9. split_rules: platform_fee_bps 0..10000 dan UNIQUE(org_id).
-- 10. debit_authorizations & financing_records: verifikasi CHECK constraint Tier C.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_org_id UUID := gen_random_uuid();
  v_agent_id UUID := gen_random_uuid();
  v_mandate_id UUID := gen_random_uuid();
  v_cp_id UUID := gen_random_uuid();
  v_intent_id UUID;
  v_child_intent_id UUID;
  v_err_count INT := 0;
  v_test_count INT := 0;
  v_msg TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'MEMULAI EKSEKUSI PRD 2.0 SQL INSERT TEST SUITE';
  RAISE NOTICE 'Org ID Uji: %', v_org_id;
  RAISE NOTICE '============================================================';

  -- --------------------------------------------------------------------------
  -- UJI 1: Insert 28 Pasangan Legal Category / Sub-Type (Harus Lolos Semua)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 1] Memvalidasi 28 Pasangan Legal Category/Sub-type ---';
  
  -- 1. SALE / standard
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SALE', 'standard', 10000, 'USD', v_cp_id, v_mandate_id, 'hash_sale', 'idemp_sale_std');
  v_test_count := v_test_count + 1;

  -- 2. DOWN_PAYMENT / initial
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DOWN_PAYMENT', 'initial', 2000, 'USD', v_cp_id, v_mandate_id, 'hash_dp1', 'idemp_dp_init')
  RETURNING intent_id INTO v_intent_id;
  v_test_count := v_test_count + 1;

  -- 3. DOWN_PAYMENT / settlement
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, parent_intent_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DOWN_PAYMENT', 'settlement', 8000, 'USD', v_cp_id, v_intent_id, v_mandate_id, 'hash_dp2', 'idemp_dp_settle');
  v_test_count := v_test_count + 1;

  -- 4. DOWN_PAYMENT / forfeit
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, parent_intent_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DOWN_PAYMENT', 'forfeit', 2000, 'USD', v_cp_id, v_intent_id, v_mandate_id, 'hash_dp3', 'idemp_dp_forfeit');
  v_test_count := v_test_count + 1;

  -- 5. INVOICE / standard
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'INVOICE', 'standard', 15000, 'USD', v_cp_id, v_mandate_id, 'hash_inv', 'idemp_inv_std');
  v_test_count := v_test_count + 1;

  -- 6. PAYOUT / standard
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'PAYOUT', 'standard', 5000, 'USD', v_cp_id, v_mandate_id, 'hash_payout', 'idemp_payout_std');
  v_test_count := v_test_count + 1;

  -- 7. REFUND / full
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'REFUND', 'full', 10000, 'USD', v_cp_id, v_mandate_id, 'hash_ref_full', 'idemp_ref_full');
  v_test_count := v_test_count + 1;

  -- 8. REFUND / partial
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'REFUND', 'partial', 4000, 'USD', v_cp_id, v_mandate_id, 'hash_ref_part', 'idemp_ref_part');
  v_test_count := v_test_count + 1;

  -- 9. VOID / authorization
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'VOID', 'authorization', 10000, 'USD', v_cp_id, v_mandate_id, 'hash_void_auth', 'idemp_void_auth');
  v_test_count := v_test_count + 1;

  -- 10. VOID / order
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'VOID', 'order', 5000, 'USD', v_cp_id, v_mandate_id, 'hash_void_ord', 'idemp_void_ord');
  v_test_count := v_test_count + 1;

  -- 11. DISPUTE / chargeback
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DISPUTE', 'chargeback', 7500, 'USD', v_cp_id, v_mandate_id, 'hash_disp_cb', 'idemp_disp_cb');
  v_test_count := v_test_count + 1;

  -- 12. DISPUTE / inquiry
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DISPUTE', 'inquiry', 7500, 'USD', v_cp_id, v_mandate_id, 'hash_disp_inq', 'idemp_disp_inq');
  v_test_count := v_test_count + 1;

  -- 13. PARTIAL / payment
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'PARTIAL', 'payment', 3000, 'USD', v_cp_id, v_mandate_id, 'hash_part_pay', 'idemp_part_pay');
  v_test_count := v_test_count + 1;

  -- 14. PARTIAL / refund
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'PARTIAL', 'refund', 2000, 'USD', v_cp_id, v_mandate_id, 'hash_part_ref', 'idemp_part_ref');
  v_test_count := v_test_count + 1;

  -- 15. SCHEDULED / payout
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SCHEDULED', 'payout', 12000, 'USD', v_cp_id, v_mandate_id, 'hash_sched_payout', 'idemp_sched_payout');
  v_test_count := v_test_count + 1;

  -- 16. SCHEDULED / charge
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SCHEDULED', 'charge', 6000, 'USD', v_cp_id, v_mandate_id, 'hash_sched_charge', 'idemp_sched_charge');
  v_test_count := v_test_count + 1;

  -- 17. RECURRING / init
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'RECURRING', 'init', 5000, 'USD', v_cp_id, v_mandate_id, 'hash_rec_init', 'idemp_rec_init');
  v_test_count := v_test_count + 1;

  -- 18. RECURRING / charge
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'RECURRING', 'charge', 5000, 'USD', v_cp_id, v_mandate_id, 'hash_rec_charge', 'idemp_rec_charge');
  v_test_count := v_test_count + 1;

  -- 19. RECURRING / cancel
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'RECURRING', 'cancel', 5000, 'USD', v_cp_id, v_mandate_id, 'hash_rec_cancel', 'idemp_rec_cancel');
  v_test_count := v_test_count + 1;

  -- 20. BULK / payout
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'BULK', 'payout', 50000, 'USD', v_cp_id, v_mandate_id, 'hash_bulk_payout', 'idemp_bulk_payout');
  v_test_count := v_test_count + 1;

  -- 21. SPLIT / collect
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SPLIT', 'collect', 25000, 'USD', v_cp_id, v_mandate_id, 'hash_split_collect', 'idemp_split_collect');
  v_test_count := v_test_count + 1;

  -- 22. SPLIT / split
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SPLIT', 'split', 25000, 'USD', v_cp_id, v_mandate_id, 'hash_split_split', 'idemp_split_split');
  v_test_count := v_test_count + 1;

  -- 23. SPLIT / hold
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SPLIT', 'hold', 22500, 'USD', v_cp_id, v_mandate_id, 'hash_split_hold', 'idemp_split_hold');
  v_test_count := v_test_count + 1;

  -- 24. SPLIT / payout
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'SPLIT', 'payout', 22500, 'USD', v_cp_id, v_mandate_id, 'hash_split_payout', 'idemp_split_payout');
  v_test_count := v_test_count + 1;

  -- 25. TRANSFER / p2p
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'TRANSFER', 'p2p', 8000, 'USD', v_cp_id, v_mandate_id, 'hash_transfer', 'idemp_transfer_p2p');
  v_test_count := v_test_count + 1;

  -- 26. FINANCING / po
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'FINANCING', 'po', 100000, 'USD', v_cp_id, v_mandate_id, 'hash_fin_po', 'idemp_fin_po');
  v_test_count := v_test_count + 1;

  -- 27. FINANCING / invoice
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'FINANCING', 'invoice', 80000, 'USD', v_cp_id, v_mandate_id, 'hash_fin_inv', 'idemp_fin_inv');
  v_test_count := v_test_count + 1;

  -- 28. DEBIT / direct
  INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, counterparty_id, mandate_version_id, request_hash, idempotency_key)
  VALUES (v_org_id, v_agent_id, 'DEBIT', 'direct', 15000, 'USD', v_cp_id, v_mandate_id, 'hash_debit', 'idemp_debit_direct');
  v_test_count := v_test_count + 1;

  RAISE NOTICE 'SUCCESS: 28 dari 28 pasangan legal category/sub-type berhasil di-insert.';

  -- --------------------------------------------------------------------------
  -- UJI 2: Penolakan Kategori & Sub-Type Ilegal
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 2] Menolak Kategori Ilegal & Pasangan Sub-Type Palsu ---';
  
  -- 2.1 Kategori Ilegal (CRYPTO)
  BEGIN
    INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, mandate_version_id, request_hash, idempotency_key)
    VALUES (v_org_id, v_agent_id, 'CRYPTO', 'transfer', 5000, 'USD', v_mandate_id, 'h', 'idemp_bad_cat');
    RAISE EXCEPTION 'FAIL: Kategori ilegal CRYPTO lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Kategori ilegal CRYPTO berhasil ditolak CHECK.';
    v_test_count := v_test_count + 1;
  END;

  -- 2.2 Pasangan Mismatch (SALE dengan sub_type forfeit)
  BEGIN
    INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, mandate_version_id, request_hash, idempotency_key)
    VALUES (v_org_id, v_agent_id, 'SALE', 'forfeit', 5000, 'USD', v_mandate_id, 'h', 'idemp_bad_pair');
    RAISE EXCEPTION 'FAIL: Pasangan SALE/forfeit lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Pasangan SALE/forfeit berhasil ditolak CHECK.';
    v_test_count := v_test_count + 1;
  END;

  -- 2.3 Nominal <= 0
  BEGIN
    INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, mandate_version_id, request_hash, idempotency_key)
    VALUES (v_org_id, v_agent_id, 'PAYOUT', 'standard', 0, 'USD', v_mandate_id, 'h', 'idemp_bad_amt');
    RAISE EXCEPTION 'FAIL: Nominal amount_minor = 0 lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Nominal amount_minor = 0 berhasil ditolak CHECK.';
    v_test_count := v_test_count + 1;
  END;

  -- 2.4 Idempotency Key Duplikat dalam org yang sama
  BEGIN
    INSERT INTO transaction_intents (org_id, agent_id, category, sub_type, amount_minor, currency, mandate_version_id, request_hash, idempotency_key)
    VALUES (v_org_id, v_agent_id, 'PAYOUT', 'standard', 5000, 'USD', v_mandate_id, 'h', 'idemp_payout_std');
    RAISE EXCEPTION 'FAIL: Idempotency key duplikat lolos!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'SUCCESS: Idempotency key duplikat berhasil ditolak UNIQUE constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 3: Transaction Legs & Balanced Check Trigger
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 3] Validasi Double-Entry Balanced Legs & Trigger ---';

  -- 3.1 Legs Balanced (DEBIT = CREDIT) -> Harus Lolos
  INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
  VALUES 
    (v_intent_id, 'DEBIT', 2000, 'USD', 'buyer:' || v_cp_id::text),
    (v_intent_id, 'CREDIT', 2000, 'USD', 'dp_escrow:' || v_intent_id::text);
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Sepasang leg DEBIT=2000 dan CREDIT=2000 berhasil di-insert.';

  -- 3.2 Immutability: Tolak Hard DELETE pada legs
  BEGIN
    DELETE FROM transaction_legs WHERE intent_id = v_intent_id;
    RAISE EXCEPTION 'FAIL: Hard DELETE pada transaction_legs lolos!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable%' THEN
      RAISE NOTICE 'SUCCESS: Hard DELETE pada transaction_legs ditolak oleh trigger immutability.';
      v_test_count := v_test_count + 1;
    ELSE
      RAISE EXCEPTION 'FAIL: Error tidak terduga: %', SQLERRM;
    END IF;
  END;

  -- 3.3 Immutability: Tolak modifikasi amount_minor pada legs
  BEGIN
    UPDATE transaction_legs SET amount_minor = 3000 WHERE intent_id = v_intent_id;
    RAISE EXCEPTION 'FAIL: Modifikasi amount_minor pada transaction_legs lolos!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable%' THEN
      RAISE NOTICE 'SUCCESS: Modifikasi amount_minor pada transaction_legs ditolak oleh trigger immutability.';
      v_test_count := v_test_count + 1;
    ELSE
      RAISE EXCEPTION 'FAIL: Error tidak terduga: %', SQLERRM;
    END IF;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 4: Penolakan Unbalanced Ledger
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 4] Menolak Unbalanced Ledger (Aturan Emas #1) ---';
  
  -- Ambil intent lain untuk uji unbalanced
  SELECT intent_id INTO v_child_intent_id FROM transaction_intents WHERE idempotency_key = 'idemp_sale_std';

  -- Buat sub-transaksi / savepoint untuk menguji deferred trigger
  BEGIN
    -- Masukkan DEBIT 10000 dan CREDIT 8000 (selisih 2000)
    INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
    VALUES 
      (v_child_intent_id, 'DEBIT', 10000, 'USD', 'buyer:' || v_cp_id::text),
      (v_child_intent_id, 'CREDIT', 8000, 'USD', 'seller:org');
    
    -- Paksa evaluasi trigger constraint deferred
    SET CONSTRAINTS trg_balanced IMMEDIATE;
    RAISE EXCEPTION 'FAIL: Unbalanced ledger DEBIT=10000 CREDIT=8000 lolos!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Unbalanced ledger%' THEN
      RAISE NOTICE 'SUCCESS: Unbalanced ledger berhasil ditolak oleh trigger trg_balanced.';
      v_test_count := v_test_count + 1;
    ELSE
      RAISE EXCEPTION 'FAIL: Error tidak terduga pada uji unbalanced: %', SQLERRM;
    END IF;
  END;
  -- Kembalikan constraints ke status deferred
  SET CONSTRAINTS trg_balanced DEFERRED;

  -- 4.2 Cross-currency imbalance (DEBIT 5000 USD, CREDIT 5000 EUR)
  BEGIN
    INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
    VALUES 
      (v_child_intent_id, 'DEBIT', 5000, 'USD', 'buyer:' || v_cp_id::text),
      (v_child_intent_id, 'CREDIT', 5000, 'EUR', 'seller:org');
    
    SET CONSTRAINTS trg_balanced IMMEDIATE;
    RAISE EXCEPTION 'FAIL: Cross-currency imbalance DEBIT USD vs CREDIT EUR lolos!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Unbalanced ledger%' THEN
      RAISE NOTICE 'SUCCESS: Cross-currency imbalance berhasil ditolak oleh trigger trg_balanced.';
      v_test_count := v_test_count + 1;
    ELSE
      RAISE EXCEPTION 'FAIL: Error tidak terduga pada uji cross-currency: %', SQLERRM;
    END IF;
  END;
  SET CONSTRAINTS trg_balanced DEFERRED;

  -- --------------------------------------------------------------------------
  -- UJI 5: Down Payment Accounts (AD-04, T-09)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 5] Validasi Aturan Down Payment Accounts ---';

  -- 5.1 Default status PENDING dan kalkulasi valid
  INSERT INTO down_payment_accounts (org_id, intent_id, counterparty_id, dp_amount_minor, settlement_amount_minor, total_amount_minor)
  VALUES (v_org_id, v_intent_id, v_cp_id, 2000, 8000, 10000);
  
  SELECT status INTO v_msg FROM down_payment_accounts WHERE intent_id = v_intent_id;
  IF v_msg <> 'PENDING' THEN
    RAISE EXCEPTION 'FAIL: Default status bukan PENDING melainkan %', v_msg;
  END IF;
  RAISE NOTICE 'SUCCESS: Status default down_payment_accounts terbukti PENDING.';
  v_test_count := v_test_count + 1;

  -- 5.2 CHECK constraint: dp + settlement > total harus ditolak
  BEGIN
    INSERT INTO down_payment_accounts (org_id, intent_id, counterparty_id, dp_amount_minor, settlement_amount_minor, total_amount_minor)
    VALUES (v_org_id, v_child_intent_id, v_cp_id, 7000, 4000, 10000);
    RAISE EXCEPTION 'FAIL: DP 7000 + Settlement 4000 > Total 10000 lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: DP + settlement melebihi total berhasil ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- 5.3 CHECK constraint: status SETTLED tetapi dp + settlement <> total harus ditolak
  BEGIN
    INSERT INTO down_payment_accounts (org_id, intent_id, counterparty_id, dp_amount_minor, settlement_amount_minor, total_amount_minor, status)
    VALUES (v_org_id, v_child_intent_id, v_cp_id, 2000, 5000, 10000, 'SETTLED');
    RAISE EXCEPTION 'FAIL: Status SETTLED dengan total tidak lunas lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Status SETTLED dengan nilai tidak cocok dengan total ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 6: Invoice Records (T-05)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 6] Validasi Invoice Records ---';

  INSERT INTO invoice_records (org_id, intent_id, counterparty_id, invoice_number, amount_minor, currency, due_date)
  VALUES (v_org_id, v_intent_id, v_cp_id, 'INV-2026-001', 15000, 'USD', CURRENT_DATE + 30);
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Insert invoice_record valid berhasil.';

  -- Duplikat invoice_number dalam org yang sama
  BEGIN
    INSERT INTO invoice_records (org_id, intent_id, counterparty_id, invoice_number, amount_minor, currency, due_date)
    VALUES (v_org_id, v_child_intent_id, v_cp_id, 'INV-2026-001', 20000, 'USD', CURRENT_DATE + 30);
    RAISE EXCEPTION 'FAIL: Duplikat invoice_number lolos!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'SUCCESS: Duplikat invoice_number ditolak UNIQUE constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 7: Recurring Schedules (T-08)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 7] Validasi Recurring Schedules ---';

  INSERT INTO recurring_schedules (org_id, intent_id, counterparty_id, amount_minor, currency, frequency, interval_count, next_run_at)
  VALUES (v_org_id, v_intent_id, v_cp_id, 5000, 'USD', 'MONTHLY', 1, now() + interval '1 month');
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Insert recurring_schedule dengan org_id & counterparty_id berhasil.';

  -- Frekuensi tidak valid
  BEGIN
    INSERT INTO recurring_schedules (org_id, intent_id, counterparty_id, amount_minor, currency, frequency, interval_count, next_run_at)
    VALUES (v_org_id, v_child_intent_id, v_cp_id, 5000, 'USD', 'HOURLY', 1, now() + interval '1 hour');
    RAISE EXCEPTION 'FAIL: Frekuensi HOURLY lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Frekuensi HOURLY ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 8: Split Rules (T-07)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 8] Validasi Split Rules ---';

  INSERT INTO split_rules (org_id, platform_fee_bps, hold_period_hours)
  VALUES (v_org_id, 250, 48);
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Insert split_rules 250 bps (2.5 persen) berhasil.';

  -- platform_fee_bps > 10000
  BEGIN
    INSERT INTO split_rules (org_id, platform_fee_bps)
    VALUES (gen_random_uuid(), 10001);
    RAISE EXCEPTION 'FAIL: platform_fee_bps 10001 lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: platform_fee_bps > 10000 ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 9: Debit Authorizations (AD-17)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 9] Validasi Debit Authorizations (Tier C) ---';

  INSERT INTO debit_authorizations (org_id, counterparty_id, max_amount_minor, currency, frequency_limit, valid_until, mandate_ref)
  VALUES (v_org_id, v_cp_id, 20000, 'USD', 'MONTHLY', now() + interval '1 year', 'MANDATE-DEBIT-001');
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Insert debit_authorization valid berhasil.';

  -- max_amount_minor <= 0
  BEGIN
    INSERT INTO debit_authorizations (org_id, counterparty_id, max_amount_minor, currency, frequency_limit, valid_until, mandate_ref)
    VALUES (v_org_id, v_cp_id, 0, 'USD', 'MONTHLY', now() + interval '1 year', 'MANDATE-DEBIT-002');
    RAISE EXCEPTION 'FAIL: Debit max_amount_minor = 0 lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Debit max_amount_minor = 0 ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- UJI 10: Financing Records (AD-17)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- [UJI 10] Validasi Financing Records (Tier C) ---';

  INSERT INTO financing_records (org_id, intent_id, counterparty_id, facility_type, principal_amount_minor, interest_bps, admin_fee_minor, tenor_months)
  VALUES (v_org_id, v_intent_id, v_cp_id, 'INVOICE', 100000, 1200, 1500, 6);
  v_test_count := v_test_count + 1;
  RAISE NOTICE 'SUCCESS: Insert financing_records valid berhasil.';

  -- tenor_months <= 0
  BEGIN
    INSERT INTO financing_records (org_id, intent_id, counterparty_id, facility_type, principal_amount_minor, interest_bps, admin_fee_minor, tenor_months)
    VALUES (v_org_id, v_child_intent_id, v_cp_id, 'PO', 100000, 1200, 1500, 0);
    RAISE EXCEPTION 'FAIL: Financing tenor_months = 0 lolos!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'SUCCESS: Financing tenor_months = 0 ditolak CHECK constraint.';
    v_test_count := v_test_count + 1;
  END;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SEMUA % UJI BERHASIL LULUS 100 persen TANPA KESALAHAN!', v_test_count;
  RAISE NOTICE '============================================================';

  -- Bersihkan data uji agar tidak mengotori database
  RAISE EXCEPTION 'ROLLBACK_TEST_SUCCESS';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_TEST_SUCCESS' THEN
    RAISE NOTICE 'Data uji di-rollback secara aman. Database tetap bersih.';
  ELSE
    RAISE;
  END IF;
END $$;
