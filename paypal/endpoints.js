/**
 * JOBENPAY UNIVERSAL TRANSACTION ENGINE
 * paypal/endpoints.js (DRAFT KANONIK)
 * 
 * Satu-satunya sumber kebenaran (Single Source of Truth) untuk seluruh
 * path URL, metode HTTP, dan katalog event PayPal Sandbox.
 * Dilarang keras menuliskan path PayPal literal di luar berkas ini.
 * 
 * Referensi: AD-12, PRD 1.3 §6, PayPal REST API Reference (v1/v2).
 */

export const PAYPAL_HOSTS = Object.freeze({
  SANDBOX: 'https://api-m.sandbox.paypal.com',
  // Sesuai Aturan Preamble A.3 & FR Sandbox-only: Dilarang keras memuat host live!
});

export const PAYPAL_ENDPOINTS = Object.freeze({
  // 1. Autentikasi OAuth 2.0
  OAUTH_TOKEN: {
    method: 'POST',
    path: '/v1/oauth2/token',
    description: 'Mendapatkan access_token menggunakan client_credentials'
  },

  // 2. Orders API (v2) - Kategori SALE, DOWN_PAYMENT, SPLIT.collect
  ORDERS: {
    CREATE: {
      method: 'POST',
      path: '/v2/checkout/orders',
      description: 'Membuat order baru dengan intent CAPTURE atau AUTHORIZE'
    },
    SHOW: {
      method: 'GET',
      path: (id) => `/v2/checkout/orders/${encodeURIComponent(id)}`,
      description: 'Mendapatkan status dan rincian order'
    },
    CAPTURE: {
      method: 'POST',
      path: (id) => `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      description: 'Menangkap dana belanja yang telah disetujui pembeli'
    },
    AUTHORIZE: {
      method: 'POST',
      path: (id) => `/v2/checkout/orders/${encodeURIComponent(id)}/authorize`,
      description: 'Mengotorisasi dana (hold 29 hari) untuk DOWN_PAYMENT'
    }
  },

  // 3. Payments API (v2) - Authorizations, Captures, Refunds
  PAYMENTS: {
    AUTHORIZATIONS: {
      SHOW: {
        method: 'GET',
        path: (authId) => `/v2/payments/authorizations/${encodeURIComponent(authId)}`,
        description: 'Mengecek status dan masa kedaluwarsa otorisasi'
      },
      CAPTURE: {
        method: 'POST',
        path: (authId) => `/v2/payments/authorizations/${encodeURIComponent(authId)}/capture`,
        description: 'Menangkap sebagian/seluruh otorisasi (final_capture: true/false)'
      },
      REAUTHORIZE: {
        method: 'POST',
        path: (authId) => `/v2/payments/authorizations/${encodeURIComponent(authId)}/reauthorize`,
        description: 'Memperbarui honor period otorisasi sebelum 29 hari'
      },
      VOID: {
        method: 'POST',
        path: (authId) => `/v2/payments/authorizations/${encodeURIComponent(authId)}/void`,
        description: 'Membatalkan otorisasi yang belum di-capture penuh (VOID.authorization)'
      }
    },
    CAPTURES: {
      SHOW: {
        method: 'GET',
        path: (captureId) => `/v2/payments/captures/${encodeURIComponent(captureId)}`,
        description: 'Mendapatkan status capture dan nilai yang dapat di-refund'
      },
      REFUND: {
        method: 'POST',
        path: (captureId) => `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
        description: 'Melakukan refund penuh atau parsial atas dana tertangkap'
      }
    },
    REFUNDS: {
      SHOW: {
        method: 'GET',
        path: (refundId) => `/v2/payments/refunds/${encodeURIComponent(refundId)}`,
        description: 'Mendapatkan status detail transaksi refund'
      }
    }
  },

  // 4. Invoicing API (v2) - Kategori INVOICE
  INVOICING: {
    CREATE: {
      method: 'POST',
      path: '/v2/invoicing/invoices',
      description: 'Membuat draf faktur tagihan'
    },
    SEND: {
      method: 'POST',
      path: (invoiceId) => `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
      description: 'Mengirim faktur ke email pembeli'
    },
    SHOW: {
      method: 'GET',
      path: (invoiceId) => `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
      description: 'Melihat status faktur (DRAFT, SENT, PAID, CANCELLED)'
    },
    CANCEL: {
      method: 'POST',
      path: (invoiceId) => `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/cancel`,
      description: 'Membatalkan faktur yang telah terkirim'
    },
    RECORD_PAYMENT: {
      method: 'POST',
      path: (invoiceId) => `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`,
      description: 'Mencatat pembayaran eksternal pada faktur'
    }
  },

  // 5. Payouts API (v1) - Kategori PAYOUT, BULK, SPLIT.payout, TRANSFER
  PAYOUTS: {
    CREATE_BATCH: {
      method: 'POST',
      path: '/v1/payments/payouts',
      description: 'Membuat batch pembayaran massal atau tunggal'
    },
    SHOW_BATCH: {
      method: 'GET',
      path: (payoutBatchId) => `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`,
      description: 'Melihat status header dan progres batch payout'
    },
    SHOW_ITEM: {
      method: 'GET',
      path: (payoutItemId) => `/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}`,
      description: 'Melihat status individu item payout (SUCCEEDED, FAILED, dsb.)'
    },
    CANCEL_ITEM: {
      method: 'POST',
      path: (payoutItemId) => `/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}/cancel`,
      description: 'Membatalkan item payout unclaimed yang belum dicairkan'
    }
  },

  // 6. Subscriptions API (v1) - Kategori RECURRING
  SUBSCRIPTIONS: {
    PRODUCTS: {
      CREATE: {
        method: 'POST',
        path: '/v1/catalogs/products',
        description: 'Mendaftarkan produk langganan'
      }
    },
    PLANS: {
      CREATE: {
        method: 'POST',
        path: '/v1/billing/plans',
        description: 'Membuat paket tagihan berkala (billing cycles)'
      }
    },
    SUBSCRIPTIONS: {
      CREATE: {
        method: 'POST',
        path: '/v1/billing/subscriptions',
        description: 'Menginisiasi kontrak langganan untuk disetujui pengguna'
      },
      SHOW: {
        method: 'GET',
        path: (subId) => `/v1/billing/subscriptions/${encodeURIComponent(subId)}`,
        description: 'Melihat status langganan (ACTIVE, PAST_DUE, CANCELLED)'
      },
      CANCEL: {
        method: 'POST',
        path: (subId) => `/v1/billing/subscriptions/${encodeURIComponent(subId)}/cancel`,
        description: 'Membatalkan langganan aktif'
      }
    }
  },

  // 7. Customer Disputes API (v1) - Kategori DISPUTE (Resolusi konflik AD-12)
  DISPUTES: {
    LIST: {
      method: 'GET',
      path: '/v1/customer-disputes',
      description: 'Melihat daftar sengketa pelanggan'
    },
    SHOW: {
      method: 'GET',
      path: (disputeId) => `/v1/customer-disputes/${encodeURIComponent(disputeId)}`,
      description: 'Melihat rincian sengketa dan tenggat waktu pembelaan'
    },
    PROVIDE_EVIDENCE: {
      method: 'POST',
      path: (disputeId) => `/v1/customer-disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
      description: 'Menyerahkan paket dokumen bukti sanggahan sengketa'
    },
    ACCEPT_CLAIM: {
      method: 'POST',
      path: (disputeId) => `/v1/customer-disputes/${encodeURIComponent(disputeId)}/accept-claim`,
      description: 'Menerima klaim pembeli dan mengembalikan dana secara sukarela'
    }
  },

  // 8. Webhook Management API (v1)
  WEBHOOKS: {
    CREATE: {
      method: 'POST',
      path: '/v1/notifications/webhooks',
      description: 'Mendaftarkan webhook listener di server PayPal'
    },
    LIST: {
      method: 'GET',
      path: '/v1/notifications/webhooks',
      description: 'Melihat webhook yang terdaftar'
    },
    VERIFY_SIGNATURE: {
      method: 'POST',
      path: '/v1/notifications/verify-webhook-signature',
      description: 'Memvalidasi keaslian tanda tangan webhook event'
    }
  }
});

