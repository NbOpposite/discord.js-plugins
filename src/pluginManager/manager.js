// eslint-disable-next-line spaced-comment
/// <reference path="../../typings/index.d.ts" />
const path = require('path');
const Plugin = require('./base');
const PluginGroup = require('./pluginGroup');
const { oneLine } = require('common-tags');
const EventProxyHandler = require('./eventProxyHandler');
const { Collection } = require('discord.js');

const privates = new WeakMap();

let isConstructor;

/**
 * @external Constructor
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/constructor}
 */

 /**
  * The main plugin manager. It extends `Map<string,PluginGroup`, but overrides any method that takes a `key`
  * in order for you to be able to use `client.plugins.get('group:plugin')` syntax, and not have to go trough
  * the hoop of using `client.plugins.get('group').get('plugin')`.
  * @extends {Collection<string,PluginGroup>}
  */
class PluginManager extends Collection {
    /** @param {Client} client - Client to use  */
	constructor(client) {
		super();
		const _privates = {};
		privates.set(this, _privates);
        /**
         * The client that instantiated this
         * @name PluginManager#client
         * @type {Client}
         * @readonly
         */
		Object.defineProperty(this, 'client', { value: client });

        /**
         * Fully resolved path to the bot's plugins directory
         * @type {?string}
         */
		this.pluginsPath = null;

        /**
         * Plugins in the process of crashing
         * @name PluginManager#crashingPlugins
         * @type {Set<Plugin>}
         * @private
         */
		_privates.crashingPlugins = new Set();
	}

	/**
	 * The `has()` method returns a boolean indicating whether an element with the specified key exists or not.<br/>
	 * Key can be the name of a {@link PluginGroup} or the format `<groupName>:<pluginName>`.<br/>
	 * If the latter it will check the existence of both the {@link PluginGroup} and if the pluginName exists.
	 * @override
	 * @param {string} key - The key of the element to test for presence in the `PluginManager` object.
	 * @returns {boolean} - true if an element with the specified key exists in the PluginManager object;
	 * otherwise false.
	 */
	has(key) {
		let pluginName = null, groupID = key;
		if(typeof key === 'string') {
			const keyArr = key.split(':');
			groupID = keyArr.shift();
			pluginName = keyArr.join(':');
		}
		if(pluginName) {
			const group = super.get(groupID);
			if(group) {
				return group.has(pluginName);
			}
		}
		return super.has(groupID);
	}

	/**
	 * The `get()` method returns a specified element from a `PluginManager` object.<br/>
	 * Key can be the name of a {@link PluginGroup} or the format `<groupName>:<pluginName>`.<br/>
	 * If the former, it will return a {@link PluginGroup}, if the latter it return a {@link Plugin} object.<br/>
	 * @override
	 * @param {string} key - The key of the element to return from the `PluginManager` object.
	 * @return {PluginGroup|Plugin|undefined} - Returns the PluginGroup or Plugin object
	 * associated with the specified key or undefined if the key can't be found in.
	 */
	get(key) {
		let pluginName = null, groupID = key;
		if(typeof key === 'string') {
			const keyArr = key.split(':');
			groupID = keyArr.shift();
			pluginName = keyArr.join(':');
		}
		const group = super.get(groupID);
		if(group && pluginName) {
			return group.get(pluginName);
		}
		return group;
	}

	/**
	 * The `set()` method adds or updates an element with a specified key and value to the `PluginManager` object.
	 * Key can be the name of a {@link PluginGroup} or the format `<groupName>:<pluginName>`.<br/>
	 * If the former, val should be a {@link PluginGroup}, if the latter `value` should be a {@link Plugin} object.<br/>
	 * **You shouldn't use this directly, instead use
	 * {@link PluginManager#loadPlugin} or {@link PluginManager#registerGroup}.**
	 * @override
	 * @param {string} key - The key of the element to add to the `PluginManager` object.
	 * @param {PluginGroup|Plugin} value - The value of the element to add to the `PluginManager` object.
	 * @return {PluginManager} The PluginManager object.
	 */
	set(key, value) {
		let pluginName = null, groupID = key;
		if(typeof key === 'string') {
			const keyArr = key.split(':');
			groupID = keyArr.shift();
			pluginName = keyArr.join(':');
		}
		if(pluginName) {
			const group = super.get(groupID);
			if(!group) throw new Error(`Group ${groupID} not found`);
			group.set(pluginName, value);
		} else {
			super.set(groupID, value);
		}
		return this;
	}

  /**
   * Registers a single group
   * @param {PluginGroup|Function|Object|string} group - A PluginGroup instance, a constructor, or the group ID
   * @param {string} [name] - Name for the group (if the first argument is the group ID)
   * @param {boolean} [guarded] - Whether the group should be guarded (if the first argument is the group ID)
   * @return {PluginManager}
   * @see {@link PluginManager#registerGroups}
   */
	registerGroup(group, name, guarded) {
		if(typeof group === 'string') {
			group = new PluginGroup(this.client, group, name, guarded);
		} else if(typeof group === 'function') {
			group = new group(this.client); // eslint-disable-line new-cap
		} else if(typeof group === 'object' && !(group instanceof PluginGroup)) {
			group = new PluginGroup(this.client, group.id, group.name, group.guarded);
		}

		const existing = this.get(group.id);
		if(existing) {
			existing.name = group.name;
			this.client.emit('debug', `Plugin group ${group.id} is already registered; renamed it to "${group.name}".`);
		} else {
			this.set(group.id, group);
			this.client.emit('pluginGroupRegister', group, this);
			this.client.emit('debug', `Registered plugin group ${group.id}.`);
		}

		return this;
	}

  /**
   * Registers multiple groups
   * @param {PluginGroup[]|Function[]|Object[]|Array<string[]>} groups - An array of PluginGroup instances,
   * constructors, plain objects (with ID, name, and guarded properties),
   * or arrays of {@link PluginManager#registerGroup} parameters
   * @return {PluginManager}
   * @example
   * plugins.registerGroups([
   * 	['fun', 'Fun'],
   * 	['mod', 'Moderation']
   * ]);
   * @example
   * plugins.registerGroups([
   * 	{ id: 'fun', name: 'Fun' },
   * 	{ id: 'mod', name: 'Moderation' }
   * ]);
   */
	registerGroups(groups) {
		if(!Array.isArray(groups)) throw new TypeError('Groups must be an Array.');
		for(const group of groups) {
			if(Array.isArray(group)) this.registerGroup(...group);
			else this.registerGroup(group);
		}
		return this;
	}

  /**
   * Loads a single plugin
   * @param {Constructor<Plugin>} PluginClass - a constructor for a Plugin
   * @return {PluginManager}
   * @see {@link PluginManager#loadPlugins}
   */
	loadPlugin(PluginClass) {
		if(!isConstructor(PluginClass)) throw new Error(`Plugin is not a constructor: ${PluginClass}`);
		if(!(PluginClass.prototype instanceof Plugin)) {
			throw new Error(`${PluginClass} is not a subclass of Plugin`);
		}
		const proxyHandler = new EventProxyHandler(this);
		const plugin = new PluginClass(new Proxy(this.client, proxyHandler));
		proxyHandler.setPlugin(plugin);

        // Make sure there aren't any conflicts
		const group = this.find(grp => grp.id === plugin.groupID);
		if(!group) throw new Error(`Group "${plugin.groupID}" is not registered.`);
		if(group.some(mod => mod.name === plugin.name)) {
			throw new Error(`A plugin with the name "${plugin.name}" is already loaded in group ${group.name}.`);
		}

		// Add the plugin
		plugin.group = group;
		group.set(plugin.name, plugin);

		this.client.emit('pluginLoaded', plugin, this);
		this.client.emit('debug', `Loaded plugin ${group.id}:${plugin.name}.`);

		if(plugin.autostart || (plugin.autostart !== false && group.autostart) || plugin.guarded || group.guarded) {
			if(plugin.autostart === false && plugin.guarded) {
				this.client.emit('warn', oneLine`${plugin.name} has autostart disabled, but has guarded set.
				this is probably incorrect. Guarded overrides autostart, so autostarting plugin anyway`);
			}
			if(plugin.autostart === false && !plugin.guarded) {
				this.client.emit('warn', oneLine`${plugin.has} did not have autostart set, is part of
				${group} which has guarded set. This is probably incorrect.
				Guarded overrides autostart, so autostarting plugin anyway`);
			}
			if(plugin.startOn) {
				const promises = plugin.startOn.map(evt => new Promise(resolve => plugin.client.once(evt, resolve)));
				Promise.all(promises).then(() => plugin.start());
			} else {
				plugin.start();
			}
		}

		return this;
	}

  /**
   * Loads an array of plugins
   * @param {Array<Constructor<Plugin>>} pluginClasses - an array of constructors for Plugins
   * @param {boolean} [ignoreInvalid=false] - Whether to skip over invalid plugins without throwing an error
   * @return {PluginManager}
   * @see {@link PluginManager#registerPlugins}
   */
	loadPlugins(pluginClasses, ignoreInvalid = false) {
		if(!Array.isArray(pluginClasses)) throw new TypeError('Plugins must be an Array.');
		for(const pluginClass of pluginClasses) {
			if(ignoreInvalid && (!isConstructor(pluginClass) || !(pluginClass.prototype instanceof Plugin))) {
				this.client.emit('warn', `Attempting to register an invalid plugin class: ${pluginClass}; skipping.`);
				continue;
			}
			this.loadPlugin(pluginClass);
		}
		return this;
	}

	/**
	 * Loads all plugins in a directory. The files must export a Plugin class constructor.
	 * @param {string|RequireAllOptions} options - The path to the directory, or a require-all options object
	 * @return {PluginManager}
	 * @example
	 * const path = require('path');
	 * plugins.loadPluginsIn(path.join(__dirname, 'plugins'));
	 */
	loadPluginsIn(options) {
		const obj = require('require-all')(options);
		const plugins = [];
		for(const group of Object.values(obj)) {
			for(let plugin of Object.values(group)) {
				if(typeof plugin.default === 'function') plugin = plugin.default;
				plugins.push(plugin);
			}
		}
		if(typeof options === 'string' && !this.pluginsPath) this.pluginsPath = options;
		return this.loadPlugins(plugins, true);
	}

	/**
	 * Reloads a plugin
	 * @param {Plugin} plugin The plugin to reload
	 * @param {boolean} throwOnFail Whether to rethrow any errors during reloading,
	 * or if to attempt a revert and just return the error.
	 * NOTE: It will still throw in some instances,
	 * depending on what goes wrong during the reload, even when this is set to true.
	 * @returns {Error?} Returns null if the reload was successful, otherwise returns the error thrown during the reload.
	 */
	reloadPlugin(plugin, throwOnFail = false) {
		let pluginPath, cached, newPlugin, started = false, destroyAttempted = false;
		try {
			started = plugin.started;
			pluginPath = this.resolvePluginPath(plugin);
			if(!pluginPath) throw new Error('Cannot find plugin path');
			cached = require.cache[pluginPath];
			delete require.cache[pluginPath];
			newPlugin = require(pluginPath);
			plugin.group.delete(plugin.name);
			this.loadPlugin(newPlugin);
			destroyAttempted = true;
			plugin.destroy();
			return null;
		} catch(err) {
			if(throwOnFail) throw err;
			if(cached && !destroyAttempted) {
				require.cache[pluginPath] = cached;
				if(plugin.group.has(plugin.name)) plugin.group.delete(plugin.name);
				plugin.group.set(plugin.name, plugin);
				if(started) plugin.start();
			} else if(destroyAttempted) {
				throw err;
			}
			return err;
		}
	}

	/**
	 * Unloads a plugin
	 * @param {Plugin} plugin The plugin to unload
	 */
	unloadPlugin(plugin) {
		if(typeof plugin === 'string') plugin = this.get(plugin);
		if(!plugin || !this.has(`${plugin.groupID}:${plugin.name}`)) throw new Error('Plugin not loaded');
		if(plugin.guarded) throw new Error(`Refusing to unload plugin, ${plugin.name} is guarded`);
		if(plugin.group.guarded) {
			throw new Error(oneLine`Refusing to unload plugin, ${plugin}
			is part of ${plugin.group} and that group is guarded`);
		}

		const pluginPath = this.resolvePluginPath(plugin);
		if(!pluginPath) throw new Error('Plugin cannot be unloaded.');

		plugin.destroy();

		delete require.cache[pluginPath];
		plugin.group.delete(plugin.name);
		this.delete(plugin);
	}

	/**
	 * Resolves a plugin file path from a plugin's group ID and name
	 * @param {Plugin} plugin - Plugin to get the path for
	 * @return {string} Fully-resolved path to the corresponding command file
	 */
	resolvePluginPath(plugin) {
		const inferredPath = path.join(this.pluginsPath, plugin.groupID, `${plugin.name}.js`);
		// First try and find the plugin trough inferredPath since this will save us from searching
		// the entire require.cache for a file that exports the current plugin.
		if(require.cache[inferredPath] && require.cache[inferredPath].exports === plugin.constructor) {
			return inferredPath;
		}

		for(let cacheId in require.cache) {
			const cached = require.cache[cacheId];
			if(cached.exports === plugin.constructor) {
				return cacheId;
			}
		}
		return null;
	}

	/**
	 * Crash a plugin. You probably don't want to call this directly see {@link Plugin#crash}
	 * for a shortcut.
	 *
	 * If the PluginManager fails to gracefully unload (or reload for guarded plugins)
	 * it will crash the entire node process. Crashed plugins that fail to gracefully unload
	 * are considered an irrecoverable undefined state, and to prevent memoryleaks and other nasty
	 * stuff, PluginManager will opt to crash the entire node process after a 5 second grace period
	 * after emitting a {@link PluginsClient#pluginFatal} event.
	 * @param {Plugin} plugin The plugin that has crashed
	 * @param {Error} err The error that caused the crash
	 */
	crash(plugin, err) {
		const _privates = privates.get(this);
		const pluginIdentifier = `${plugin.groupID}:${plugin.name}`;
		if(_privates.crashingPlugins.has(pluginIdentifier)) return;
		_privates.crashingPlugins.add(pluginIdentifier);
		this.client.emit('pluginError', plugin, err);
		try {
			if(!plugin.guarded) {
				plugin.unload();
			} else {
				plugin.reload(true);
			}
			_privates.crashingPlugins.delete(pluginIdentifier);
		} catch(err2) {
			// Give logging and other stuff 5 seconds to do stuff before forcibly crashing the process.
			setTimeout(() => process.exit(1), 5000);
			this.client.emit('pluginFatal', 'Failed to unload crashed plugin', err2);
			this.client.destroy();
		}
	}
}

module.exports = PluginManager;
isConstructor = require('../util').isConstructor;
