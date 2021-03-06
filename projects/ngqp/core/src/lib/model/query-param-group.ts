import { Observable, Subject } from 'rxjs';
import { isMissing, undefinedToNull } from '../util';
import { OnChangeFunction } from '../types';
import { MultiQueryParam, QueryParam, PartitionedQueryParam } from './query-param';
import { RouterOptions } from '../router-adapter/router-adapter.interface';

/**
 * Groups multiple {@link QueryParam} instances to a single unit.
 *
 * This "bundles" multiple parameters together such that changes can be emitted as a
 * complete unit. Collecting parameters into a group is required for the synchronization
 * to and from the URL.
 */
export class QueryParamGroup {

    /** @internal */
    private readonly _valueChanges = new Subject<Record<string, any>>();

    /**
     * Emits the values of all parameters in this group whenever at least one changes.
     *
     * This observable emits an object keyed by the {@QueryParam} names where each key
     * carries the current value of the represented parameter. It emits whenever at least
     * one parameter's value is changed.
     *
     * NOTE: This observable does not complete on its own, so ensure to unsubscribe from it.
     */
    public readonly valueChanges: Observable<Record<string, any>> = this._valueChanges.asObservable();

    /** @internal */
    private readonly _queryParamAdded$ = new Subject<string>();

    /** @internal */
    public readonly queryParamAdded$: Observable<string> = this._queryParamAdded$.asObservable();

    /** @internal */
    public readonly queryParams: { [ queryParamName: string ]: QueryParam<unknown> | MultiQueryParam<unknown> | PartitionedQueryParam<unknown> };

    /** @internal */
    public readonly routerOptions: RouterOptions;

    private changeFunctions: OnChangeFunction<Record<string, any>>[] = [];

    constructor(
        queryParams: { [ queryParamName: string ]: QueryParam<unknown> | MultiQueryParam<unknown> | PartitionedQueryParam<unknown> },
        extras: RouterOptions = {}
    ) {
        this.queryParams = queryParams;
        this.routerOptions = extras;

        Object.values(this.queryParams).forEach(queryParam => queryParam._setParent(this));
    }

    /** @internal */
    public _registerOnChange(fn: OnChangeFunction<Record<string, any>>): void {
        this.changeFunctions.push(fn);
    }

    /** @internal */
    public _clearChangeFunctions(): void {
        this.changeFunctions = [];
    }

    /**
     * Retrieves a specific parameter from this group by name.
     *
     * This returns an instance of either {@link QueryParam}, {@link MultiQueryParam}
     * or {@link PartitionedQueryParam} depending on the configuration, or `null`
     * if no parameter with that name is found in this group.
     *
     * @param queryParamName The name of the parameter instance to retrieve.
     */
    public get(queryParamName: string): QueryParam<unknown> | MultiQueryParam<unknown> | PartitionedQueryParam<unknown> | null {
        const param = this.queryParams[ queryParamName ];
        if (!param) {
            return null;
        }

        return param;
    }

    /**
     * Adds a new {@link QueryParam} to this group.
     *
     * This adds the parameter under the given name to this group. The current
     * URL will be evaluated to synchronize its value initially. Afterwards
     * it is treated just like any other parameter in this group.
     *
     * @param queryParamName Name of the parameter to reference it with.
     * @param queryParam The new parameter to add.
     */
    public add(queryParamName: string, queryParam: QueryParam<unknown> | MultiQueryParam<unknown> | PartitionedQueryParam<unknown>): void {
        if (this.get(queryParamName)) {
            throw new Error(`A parameter with name ${queryParamName} already exists.`);
        }

        this.queryParams[ queryParamName ] = queryParam;
        queryParam._setParent(this);
        this._queryParamAdded$.next(queryParamName);
    }

    /**
     * Removes a {@link QueryParam} from this group.
     *
     * This removes the parameter defined by the provided name from this group.
     * No further synchronization with this parameter will occur and it will not
     * be reported in the value of this group anymore.
     *
     * @param queryParamName The name of the parameter to remove.
     */
    public remove(queryParamName: string): void {
        const queryParam = this.get(queryParamName);
        if (!queryParam) {
            throw new Error(`No parameter with name ${queryParamName} found.`);
        }

        delete this.queryParams[ queryParamName ];
        queryParam._setParent(null);
        queryParam._clearChangeFunctions();
    }

    /**
     * The current value of this group.
     *
     * See {@link QueryParamGroup#valueChanges} for a description of the format of
     * the value.
     */
    public get value(): Record<string, any> {
        const value: Record<string, any> = {};
        Object.keys(this.queryParams).forEach(queryParamName => value[ queryParamName ] = this.queryParams[ queryParamName ].value);

        return value;
    }

    /**
     * Updates the value of this group by merging it in.
     *
     * This sets the value of each provided parameter to the respective provided
     * value. If a parameter is not listed, its value remains unchanged.
     *
     * @param value See {@link QueryParamGroup#valueChanges} for a description of the format.
     * @param opts Additional options
     */
    public patchValue(value: Record<string, any>, opts: {
        emitEvent?: boolean,
        emitModelToViewChange?: boolean,
    } = {}): void {
        Object.keys(value).forEach(queryParamName => {
            const queryParam = this.queryParams[ queryParamName ];
            if (isMissing(queryParam)) {
                return;
            }

            queryParam.setValue(value[ queryParamName ], {
                emitEvent: opts.emitEvent,
                onlySelf: true,
                emitModelToViewChange: false,
            });
        });

        this._updateValue(opts);
    }

    /**
     * Updates the value of this group by overwriting it.
     *
     * This sets the value of each provided parameter to the respective provided
     * value. If a parameter is not listed, its value is set to `undefined`.
     *
     * @param value See {@link QueryParamGroup#valueChanges} for a description of the format.
     * @param opts Additional options
     */
    public setValue(value: Record<string, any>, opts: {
        emitEvent?: boolean,
        emitModelToViewChange?: boolean,
    } = {}): void {
        Object.keys(this.queryParams).forEach(queryParamName => {
            this.queryParams[ queryParamName ].setValue(undefinedToNull(value[ queryParamName ]), {
                emitEvent: opts.emitEvent,
                onlySelf: true,
                emitModelToViewChange: false,
            });
        });

        this._updateValue(opts);
    }

    /** @internal */
    public _updateValue(opts: {
        emitEvent?: boolean,
        emitModelToViewChange?: boolean,
    } = {}): void {
        if (opts.emitModelToViewChange !== false) {
            this.changeFunctions.forEach(changeFn => changeFn(this.value));
        }

        if (opts.emitEvent !== false) {
            this._valueChanges.next(this.value);
        }
    }

}