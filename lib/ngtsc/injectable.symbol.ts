import { InjectableHandlerData } from '@angular/compiler-cli/src/ngtsc/annotations/src/injectable';
import { Symbol } from './symbol';
import { assertDeps } from './utils';


export class InjectableSymbol extends Symbol<InjectableHandlerData> {
  protected readonly annotation = 'Injectable';

  get deps() {
    return this.metadata.userDeps
      ? this.metadata?.userDeps
      : this.analysis.ctorDeps;
  }

  get metadata() {
    return this.analysis.meta;
  }

  getDependancies() {
    assertDeps(this.deps, this.name);
    return this.deps.map(dep => this.workspace.findSymbol(dep.token));
  }
}
