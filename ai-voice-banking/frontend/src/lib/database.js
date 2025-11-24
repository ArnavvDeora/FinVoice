/**
 * @typedef {Object} Profiles
 * @property {string} id - UUID Primary Key (from auth.users).
 * @property {string} email - User's email (Unique).
 * @property {string} full_name - Full name of the user.
 * @property {string} created_at - Timestamp of creation.
 * @property {string} mobile_number - User's mobile number (new field for auth/MFA).
 */

/* -------------------------------------------------------------------------- */
/*                         NEW BANKING SCHEMA (Updated)                       */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} BankAccounts
 * @property {string} user_id - UUID Primary Key. References profiles(id).
 * @property {number} balance - Current account balance.
 * @property {string} account_holder - Full name of account holder.
 * @property {string} account_number - Account number.
 * @property {string} type - Account type (Default: 'Savings').
 * @property {string} last_updated - Last update timestamp.
 */

/**
 * @typedef {Object} BankTransactions
 * @property {string} id - UUID Primary Key.
 * @property {string} account_id - FK referencing bank_accounts.user_id.
 * @property {'debit' | 'credit' | 'transfer'} type - Transaction type.
 * @property {number} amount - Transaction amount.
 * @property {string} description - Description of the transaction.
 * @property {string | null} recipient_name - Recipient nickname (optional).
 * @property {string | null} recipient_account_number - Recipient account number.
 * @property {string | null} merchant - Merchant name (for categorization).
 * @property {string} category - Category (e.g., 'Food & Dining', 'Ecommerce').
 * @property {string} timestamp - Timestamp of the transaction.
 */

/**
 * @typedef {Object} BankRecipients
 * @property {string} id - UUID Primary Key.
 * @property {string} user_id - FK referencing profiles(id).
 * @property {string} name - Unique nickname per user.
 * @property {string} account_number - Recipient account number.
 * @property {string | null} ifsc_code - IFSC code (optional).
 * @property {string | null} transaction_id - UPI/Payment ID.
 * @property {string} created_at - Timestamp of creation.
 */

/**
 * @typedef {Object} AuditLogs
 * @property {string} id - UUID primary key.
 * @property {string} user_id - Foreign key.
 * @property {string} action - The action performed (e.g., TRANSFER).
 * @property {Object} payload - JSON object containing action details.
 * @property {string} timestamp - Timestamp of the log.
 * @property {string} status - Status of the action.
 */

/**
 * @typedef {Object} Database
 * @property {Object} public
 * @property {Object.<string, Profiles>} profiles
 * @property {Object.<string, BankAccounts>} bank_accounts
 * @property {Object.<string, BankTransactions>} bank_transactions
 * @property {Object.<string, BankRecipients>} bank_recipients
 * @property {Object.<string, AuditLogs>} audit_logs
 */