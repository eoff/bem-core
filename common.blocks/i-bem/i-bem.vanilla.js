/**
 * @module i-bem
 */

modules.define(
    'i-bem',
    [
        'i-bem__internal',
        'inherit',
        'identify',
        'next-tick',
        'objects',
        'functions',
        'events'
    ],
    function(
        provide,
        INTERNAL,
        inherit,
        identify,
        nextTick,
        objects,
        functions,
        events) {

var undef,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    /**
     * Storage for block init functions
     * @private
     * @type Array
     */
    initFns = [],

    /**
     * Storage for block declarations (hash by block name)
     * @private
     * @type Object
     */
    entities = {};

/**
 * Builds the name of the handler method for setting a modifier
 * @param {String} prefix
 * @param {String} modName Modifier name
 * @param {String} modVal Modifier value
 * @returns {String}
 */
function buildModFnName(prefix, modName, modVal) {
    return '__' + prefix +
       '__mod' +
       (modName? '_' + modName : '') +
       (modVal? '_' + modVal : '');
}

/**
 * Transforms a hash of modifier handlers to methods
 * @param {String} prefix
 * @param {Object} modFns
 * @param {Object} props
 */
function modFnsToProps(prefix, modFns, props) {
    if(functions.isFunction(modFns)) {
        props[buildModFnName(prefix, '*', '*')] = modFns;
    } else {
        var modName, modVal, modFn;
        for(modName in modFns) {
            modFn = modFns[modName];
            if(functions.isFunction(modFn)) {
                props[buildModFnName(prefix, modName, '*')] = modFn;
            } else {
                for(modVal in modFn) {
                    props[buildModFnName(prefix, modName, modVal)] = modFn[modVal];
                }
            }
        }
    }
}

function buildCheckMod(modName, modVal) {
    return modVal?
        Array.isArray(modVal)?
            function(block) {
                var i = 0, len = modVal.length;
                while(i < len)
                    if(block.hasMod(modName, modVal[i++]))
                        return true;
                return false;
            } :
            function(block) {
                return block.hasMod(modName, modVal);
            } :
        function(block) {
            return block.hasMod(modName);
        };
}

function convertModHandlersToMethods(props) {
    if(props.beforeSetMod) {
        modFnsToProps('before', props.beforeSetMod, props);
        delete props.beforeSetMod;
    }

    if(props.onSetMod) {
        modFnsToProps('after', props.onSetMod, props);
        delete props.onSetMod;
    }
}

function declEntity(baseCls, entityName, base, props, staticProps) {
    if(!base || (typeof base === 'object' && !Array.isArray(base))) {
        staticProps = props;
        props = base;
        base = entities[entityName] || baseCls;
    }

    props && convertModHandlersToMethods(props);

    if(staticProps && typeof staticProps.live === 'boolean') {
        var live = staticProps.live;
        staticProps.live = function() { return live; };
    }

    var Base = Array.isArray(base)? base[0] : base,
        entityCls;

    entityName === Base.getEntityName()?
        // makes a new "live" if the old one was already executed
        (entityCls = inherit.self(base, props, staticProps))._processLive(true) :
        (entityCls = entities[entityName] = inherit(base, props, staticProps));

    return entityCls;
}

/**
 * @class BemEntity
 * @description Base block for creating BEM blocks
 * @augments events:Emitter
 */
var BemEntity = inherit(events.Emitter, /** @lends BemEntity.prototype */ {
    /**
     * @constructor
     * @private
     * @param {Object} mods BemEntity modifiers
     * @param {Object} params BemEntity parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(mods, params, initImmediately) {
        /**
         * Cache of modifiers
         * @member {Object}
         * @private
         */
        this._modCache = mods || {};

        /**
         * Current modifiers in the stack
         * @member {Object}
         * @private
         */
        this._processingMods = {};

        /**
         * BemEntity parameters, taking into account the defaults
         * @member {Object}
         * @readonly
         */
        this.params = objects.extend(this.getDefaultParams(), params);

        initImmediately !== false?
            this._init() :
            initFns.push(this._init, this);
    },

    /**
     * Initializes the BEM entity
     * @private
     */
    _init : function() {
        return this.setMod('js', 'inited');
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {BemEntity} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {BemEntity} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Executes the BEM entity's event handlers and live event handlers
     * @protected
     * @param {String} e Event name
     * @param {Object} [data] Additional information
     * @returns {BemEntity} this
     */
    emit : function(e, data) {
        var isModJsEvent = false;
        if(typeof e === 'object' && !(e instanceof events.Event)) {
            isModJsEvent = e.modName === 'js';
            e = this.__self._buildModEventName(e);
        }

        if(isModJsEvent || this.hasMod('js', 'inited')) {
            this.__base(e = this._buildEvent(e), data);
            this._ctxEmit(e, data);
        }

        return this;
    },

    _ctxEmit : function(e, data) {
        this.__self.emit(e, data);
    },

    /**
     * Builds event
     * @private
     * @param {String|events:Event} e
     * @returns {events:Event}
     */
    _buildEvent : function(e) {
        typeof e === 'string'?
            e = new events.Event(e, this) :
            e.target || (e.target = this);

        return e;
    },

    /**
     * Checks whether a BEM entity has a modifier
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {Boolean}
     */
    hasMod : function(modName, modVal) {
        var withModVal = arguments.length === 2;
        withModVal && (typeof modVal === 'boolean' || (modVal = modVal.toString()));

        var res = this.getMod(modName) === (modVal || '');
        return withModVal? res : !res;
    },

    /**
     * Returns the value of the modifier of the BEM entity
     * @param {String} modName Modifier name
     * @returns {String} Modifier value
     */
    getMod : function(modName) {
        var modCache = this._modCache;
        return modName in modCache?
            modCache[modName] || '' :
            modCache[modName] = this._extractModVal(modName);
    },

    /**
     * Sets the modifier for a BEM entity
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal=true] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {BemEntity} this
     */
    setMod : function(modName, modVal) {
        var typeModVal = typeof modVal;
        if(typeModVal === 'undefined') {
            modVal = true;
        } else if(typeModVal === 'boolean') {
            modVal === false && (modVal = '');
        } else {
            modVal = modVal.toString();
        }

        if(this._processingMods[modName]) return this;

        var curModVal = this.getMod(modName);
        if(curModVal === modVal) return this;

        this._processingMods[modName] = true;

        var needSetMod = true,
            modFnParams = [modName, modVal, curModVal];

        var modVars = [['*', '*'], [modName, '*'], [modName, modVal]],
            prefixes = ['before', 'after'],
            i = 0, prefix, j, modVar;

        while(prefix = prefixes[i++]) {
            j = 0;
            while(modVar = modVars[j++]) {
                if(this._callModFn(prefix, modVar[0], modVar[1], modFnParams) === false) {
                    needSetMod = false;
                    break;
                }
            }

            if(!needSetMod) break;

            if(prefix === 'before') {
                this._modCache[modName] = modVal;
                this._onSetMod(modName, modVal, curModVal);
            }
        }

        this._processingMods[modName] = null;
        needSetMod && this._emitModChangeEvents(modName, modVal, curModVal);

        return this;
    },

    /**
     * Function after successfully changing the modifier of the BEM entity
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     */
    _onSetMod : function(modName, modVal, oldModVal) {},

    _emitModChangeEvents : function(modName, modVal, oldModVal) {
        var eventData = { modName : modName, modVal : modVal, oldModVal : oldModVal };
        this
            .emit({ modName : modName, modVal : '*' }, eventData)
            .emit({ modName : modName, modVal : modVal }, eventData);
    },

    /**
     * Sets a modifier for a BEM entity, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @param {String} modName Modifier name
     * @param {String} modVal1 First modifier value
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {BemEntity} this
     */
    toggleMod : function(modName, modVal1, modVal2, condition) {
        typeof modVal1 === 'undefined' && (modVal1 = true); // boolean mod

        if(typeof modVal2 === 'undefined') {
            modVal2 = '';
        } else if(typeof modVal2 === 'boolean') {
            condition = modVal2;
            modVal2 = '';
        }

        var modVal = this.getMod(modName);
        (modVal === modVal1 || modVal === modVal2) &&
            this.setMod(
                modName,
                typeof condition === 'boolean'?
                    (condition? modVal1 : modVal2) :
                    this.hasMod(modName, modVal1)? modVal2 : modVal1);

        return this;
    },

    /**
     * Removes a modifier from a BEM entity
     * @protected
     * @param {String} modName Modifier name
     * @returns {BemEntity} this
     */
    delMod : function(modName) {
        return this.setMod(modName, '');
    },

    /**
     * Executes handlers for setting modifiers
     * @private
     * @param {String} prefix
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {Array} modFnParams Handler parameters
     */
    _callModFn : function(prefix, modName, modVal, modFnParams) {
        var modFnName = buildModFnName(prefix, modName, modVal);
        return this[modFnName]?
           this[modFnName].apply(this, modFnParams) :
           undef;
    },

    _extractModVal : function(modName) {
        return '';
    },

    /**
     * Returns a BEM entity's default parameters
     * @protected
     * @returns {Object}
     */
    getDefaultParams : function() {
        return {};
    },

    /**
     * Deletes a BEM entity
     * @private
     */
    _destruct : function() {
        this.delMod('js');
    },

    /**
     * Executes given callback on next turn eventloop in BEM entity's context
     * @protected
     * @param {Function} fn callback
     * @returns {BemEntity} this
     */
    nextTick : function(fn) {
        var _this = this;
        nextTick(function() {
            _this.hasMod('js', 'inited') && fn.call(_this);
        });
        return this;
    }
}, /** @lends BemEntity */{
    /**
     * Factory method for creating an instance
     * @param {Object} mods modifiers
     * @param {Object} params params
     * @returns {BemEntity}
     */
    create : function(mods, params) {
        return new this(mods, params);
    },

    /**
     * Declares modifier
     * @param {Object} mod
     * @param {String} mod.modName
     * @param {String|Boolean|Array} [mod.modVal]
     * @param {Object} props
     * @param {Object} [staticProps]
     * @returns {Function}
     */
    declMod : function(mod, props, staticProps) {
        props && convertModHandlersToMethods(props);

        var checkMod = buildCheckMod(mod.modName, mod.modVal),
            basePtp = this.prototype;

        objects.each(props, function(prop, name) {
            functions.isFunction(prop) &&
                (props[name] = function() {
                    var method;
                    if(checkMod(this)) {
                        method = prop;
                    } else {
                        var baseMethod = basePtp[name];
                        baseMethod && baseMethod !== prop &&
                            (method = this.__base);
                    }
                    return method?
                        method.apply(this, arguments) :
                        undef;
                });
        });

        return inherit.self(this, props, staticProps);
    },

    _name : 'i-bem',

    /**
     * Processes a BEM entity's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the BEM entity already processed its live properties
     * @returns {Boolean} Whether the BEM entity is a live
     */
    _processLive : function(heedLive) {
        return false;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getName : function() {
        return this._name;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getEntityName : function() {
        return this._name;
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    _buildModEventName : function(modEvent) {
        return MOD_DELIM + modEvent.modName + MOD_DELIM + (modEvent.modVal === false? '' : modEvent.modVal);
    }
});

/**
 * @class Block
 * @description Class for creating BEM blocks
 * @augments BemEntity
 */
var Block = BemEntity;

/**
 * @class Elem
 * @description Class for creating BEM elems
 * @augments BemEntity
 */
var Elem = inherit(BemEntity, /** @lends Elem.prototype */ {
    /**
     * Returns the own block of current element
     * @returns {Block}
     */
    block : function() {
        return this._block;
    }
    // TODO: _emitModChangeEvents?
}, /** @lends Elem */{
    /**
     * Factory method for creating an instance
     * @param {Object} block block instance
     * @param {Object} mods modifiers
     * @param {Object} params params
     * @returns {BemEntity}
     */
    create : function(block, mods, params) {
        var res = new this(mods, params);
        res._block = block;
        return res;
    },

    /**
     * Returns the name of the current BEM entity
     * @returns {String}
     */
    getEntityName : function() {
        return this._blockName + ELEM_DELIM + this._name;
    }
});

provide(/** @exports */{
    /**
     * Block class
     * @type Function
     */
    Block : Block,

    /**
     * Elem class
     * @type Function
     */
    Elem : Elem,

    /**
     * Storage for block declarations (hash by block name)
     * @type Object
     */
    entities : entities,

    /**
     * Declares block and creates a block class
     * @param {String} blockName Block name
     * @param {Function|Array[Function]} [base] base block + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Block class
     */
    declBlock : function(blockName, base, props, staticProps) {
        var res = declEntity(Block, blockName, base, props, staticProps);
        res._name = res._blockName = blockName;
        return res;
    },

    /**
     * Declares elem and creates an elem class
     * @param {String} blockName Block name
     * @param {String} elemName Elem name
     * @param {Function|Array[Function]} [base] base elem + mixes
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function} Elem class
     */
    declElem : function(blockName, elemName, base, props, staticProps) {
        var res = declEntity(Elem, blockName + ELEM_DELIM + elemName, base, props, staticProps);
        res._blockName = blockName;
        res._name = elemName;
        return res;
    },

    declMix : function(blockName, props, staticProps) {
        convertModHandlersToMethods(props || (props = {}));
        return entities[blockName] = inherit(props, staticProps);
    },

    /**
     * Executes the block init functions
     * @private
     */
    _runInitFns : function() {
        if(initFns.length) {
            var fns = initFns,
                fn, i = 0;

            initFns = [];
            while(fn = fns[i]) {
                fn.call(fns[i + 1]);
                i += 2;
            }
        }
    }
});

});
