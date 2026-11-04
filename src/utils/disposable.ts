export interface IDisposable {
  dispose(): void | Promise<void>;
}

export class CompositeDisposable implements IDisposable {
  private disposables: IDisposable[] = [];
  private isDisposed = false;

  public add<T extends IDisposable>(disposable: T): T {
    if (this.isDisposed) {
      try {
        disposable.dispose();
      } catch (err) {
        // Ignored on already disposed container
      }
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (err) {
        // Safe cleanup
      }
    }
    this.disposables = [];
  }
}

