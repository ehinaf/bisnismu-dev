-- Struk publik bertoken: tautan /r/:token memakai string acak (122 bit), bukan
-- id transaksi. DEFAULT volatile dievaluasi per baris, jadi transaksi lama
-- langsung mendapat token masing-masing.
ALTER TABLE "transactions" ADD COLUMN     "receipt_token" VARCHAR(32) NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

CREATE UNIQUE INDEX "transactions_receipt_token_key" ON "transactions"("receipt_token");
