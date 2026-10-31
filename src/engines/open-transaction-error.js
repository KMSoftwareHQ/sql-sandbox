// Thrown by exportSnapshot() while the user has an unfinished write transaction (BEGIN without
// COMMIT): saving then would lose that work on restore, so the previous snapshot is kept instead.
export class OpenTransactionError extends Error {
  constructor() {
    super('A transaction is still open.');
    this.name = 'OpenTransactionError';
  }
}
