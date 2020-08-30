import type { WorkspaceSymbols } from './workspace.symbols';
import { InjectableSymbol } from './injectable.symbol';
import { Reference } from '@angular/compiler-cli/src/ngtsc/imports';
import { DynamicValue, ResolvedValue } from '@angular/compiler-cli/src/ngtsc/partial_evaluator';
import { isClassDeclaration, isIdentifier, Node, isArrayLiteralExpression, Identifier } from 'typescript';
import { Expression } from 'typescript';
import { WrappedNodeExpr } from '@angular/compiler/src/output/output_ast';
import { isAnalysed, filterByHandler } from './symbol';
import { AnnotationNames } from './utils';
import { ClassDeclaration } from '@angular/compiler-cli/src/ngtsc/reflection';


/////////
// WIP //
/////////


const useKeys = ['useValue', 'useFactory', 'useExisting'] as const;
type UseKey = typeof useKeys[number];

interface ProviderMetadata {
  provide: Reference | DynamicValue;
  useKey: UseKey;
  value: any;
}

export function getProviderMetadata(provider: Map<any, any>): ProviderMetadata | null {
  const provide = provider.get('provide');
  if (!provide) {
    return null;
  }
  const useKey = useKeys.find(key => provider.has(key));
  if (!useKey) {
    return null;
  }
  const value = provider.get(useKey);
  return { provide, useKey, value };
}

export class Provider {
  constructor(
    protected workspace: WorkspaceSymbols,
    public metadata: ProviderMetadata
  ) { }

  get name() {
    if (this.metadata.provide instanceof Reference) {
      if (isClassDeclaration(this.metadata.provide.node)) {
        return this.metadata.provide.node.name?.text;
      }
    }
    if (this.metadata.provide instanceof DynamicValue) {
      if (isIdentifier(this.metadata.provide.node)) {
        return this.metadata.provide.node.text;
      }
    }
  }
}

// TODO : Create a provider registry to keep track of Providers
export class ProviderRegistry {
  /** List of all the providers that are not injectables */
  private providers: Map<string | DynamicValue | Reference<Node>, Provider> = new Map();
  constructor(private workspace: WorkspaceSymbols) { }

  /** Record all providers in every NgModule, Component & Directive */
  recordAll() {
    // Helper fn to get all analysis of an annotation
    const getAllAnalysis = <A extends AnnotationNames>(annotation: A) => {
      const records = this.workspace.traitCompiler.allRecords(annotation);
      return records.map(record => {
        const [analysis] = record.traits.filter(filterByHandler<A>(annotation))
          .filter(isAnalysed)
          .map(trait => trait.analysis);
        return analysis;
      });
    }
    for (const analysis of getAllAnalysis('NgModule')) {
      if (analysis) {
        this.recordProviders(analysis.providers);
      }
    }
    for (const analysis of getAllAnalysis('Component')) {
      if (analysis?.meta.providers instanceof WrappedNodeExpr) {
        this.recordProviders(analysis.meta.providers.node);
      }
    }
    for (const analysis of getAllAnalysis('Directive')) {
      if (analysis?.meta.providers instanceof WrappedNodeExpr) {
        this.recordProviders(analysis.meta.providers.node);
      }
    }
  }

  /** Find all providers of a provider expression */
  recordProviders(expression: Expression | null) {
    if (expression) {
      const resolveValue = this.workspace.evaluator.evaluate(expression);
      const visit = (value: any) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (value instanceof Map) {
          const metadata = getProviderMetadata(value);
          if (metadata) {
            const provider = new Provider(this.workspace, metadata);
            this.providers.set(metadata.provide, provider);
          }
        }
      }
      visit(resolveValue);
    }
  }

  /** Get all providers from a list of providers in a decorator NgModule, Directive, Component */
  getAllProviders(expression: Expression | null) {
    const result: (InjectableSymbol | Provider)[] = [];
    if (expression) {
      const resolveValue = this.workspace.evaluator.evaluate(expression);
      const addInjectable = (ref: Reference<ClassDeclaration>) => {
        const symbol = this.workspace.getSymbol(ref.node);
        if (symbol) {
          result.push(symbol as InjectableSymbol);
        }
      }
      const addProvider = (value: string | DynamicValue) => {
        const provider = this.providers.get(value);
        if (provider) result.push(provider);
      }
      const visit = (value: any) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (value instanceof Map) {
          if (value.has('useClass')) {
            addInjectable(value.get('useClass'))
          } else {
            addProvider(value.get('provide'));
          }
        } else {
          addInjectable(value);
        }
      }
      visit(resolveValue);
    }
    return result;
  }
}