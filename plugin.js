
const DNS = require("dns");

// @see https://dnsimple.com/domains
// @see https://github.com/fvdm/nodejs-dnsimple

exports.for = function (API) {

	var exports = {};

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {

			// TODO: Use 'previousResolvedConfig' where possible to avoid additional networks
			//       calls when everything is assumed to not have changed.

			if (
				!resolvedConfig['$pinf.logic-for-dns~0'] ||
				!resolvedConfig['$pinf.logic-for-dns~0'].records
			) {
	        	API.console.verbose("Skip resolve DNS. No records declared.", resolvedConfig);

				return resolvedConfig;
			}

			if (
				!resolvedConfig.credentials ||
				!resolvedConfig.credentials.email ||
				!resolvedConfig.credentials.token
			) {
				resolvedConfig.status = "ignore";
				// TODO: Advice that config is not complete.

	        	API.console.verbose("Skip resolve DNS. No credentials declared.", resolvedConfig);

				return resolvedConfig;
			}

			// TODO: Strict validation.
			API.ASSERT.equal(typeof resolvedConfig.credentials.email, "string");
			API.ASSERT.equal(typeof resolvedConfig.credentials.token, "string");

	        var records = resolvedConfig['$pinf.logic-for-dns~0'].records;

        	API.console.verbose("DNS resolve for records", records);

/*
TODO: Use this more compact version vs the more verbose one below.
    function lookup (name, type) {
    	function resolve (name, type) {
	    	API.console.verbose("DNS resolve" + (type ? (" '" + type + "'"):"") + " for: " + name);
    		if (type) {
	            return API.Q.denodeify(DNS.resolve)(name, type);
    		} else {
	            return API.Q.denodeify(DNS.resolve)(name);
    		}
    	}
    	if (!lookup._unresolvingIP) {
    		return resolve("a.domain.that.will.never.resolve." + Date.now() + ".so.we.can.determine.default.ip.com").then(function(addresses) {
	        	lookup._unresolvingIP = addresses[0] || null;
	        }).then(function () {
	        	return lookup(name, type);
	        });
    	}
        return resolve(name, type).then(function (addresses) {
			if (typeof addresses === "string") {
				addresses = [ addresses ];
			}
	        return addresses.filter(function(ip) {
	            if (ip == lookup._unresolvingIP) return false;
	            return true;
	        });
        }).fail(function(err) {
        	if (!/^a\.domain\.that\.will\.never\.resolve\./.test(name)) {
        		API.console.debug("Warning: Error looking up hostname '" + name + "':", err.stack);
            }
            return [];
        });
    }
*/
	        function lookup (name, type) {
	        	API.console.verbose("DNS resolve" + (type ? (" '" + type + "'"):"") + " for: " + name);

	        	function resolve () {
	        		if (type) {
			            return API.Q.denodeify(DNS.resolve)(name, type);
	        		} else {
			            return API.Q.denodeify(DNS.resolve)(name);
	        		}
	        	}

	            return resolve().then(function (addresses) {

	            	// TODO: Optionally call each IP to fetch a well-known url containing
	            	//       public key to ensure that IP is managed by us.
					/*            
		            // Check if hostname points to our VM so we can recover missing IP address.
		            function isOurs (host, port) {
		                var deferred = Q.defer();
		                var url = "http://" + state["pio"].hostname + ":" + state["pio.services"].services["pio.server"].descriptor.env.PORT + "/.instance-id/" + state["pio"].instanceId;
		                REQUEST({
		                    method: "POST",
		                    url: url,
		                    timeout: 1 * 1000
		                }, function(err, res, body) {
		                    if (err) {
		                        var message = [
		                            "Error while checking if instance is ours by calling '" + url + "'.",
		                            "Hostname '" + state["pio"].hostname + "' is likely not resolving to the IP '" + state["pio.vm"].ip + "' of our server!",
		                            "To see what the hostname resolves to use: http://cachecheck.opendns.com/",
		                            "You can use http://opendns.com/ (which refreshes fast) for your DNS servers:",
		                            "  208.67.222.222",
		                            "  208.67.220.220",
		                            "Then flush your local DNS cache:",
		                            " sudo killall -HUP mDNSResponder",
		                            " sudo dscacheutil -flushcache",
		                            "TODO: Why does running the above command not immediately flush the DNS cache even though the host resolves correctly on opendns?",
		                            "TODO: Insert a temporary entry into the /etc/hosts. We need a sudo/root daemon first."
		                        ].join("\n").red;
		                        if (
		                            err.code === "ESOCKETTIMEDOUT" ||
		                            err.code === "ETIMEDOUT"
		                        ) {
		                            console.error("Warning: TIMEOUT " + message, err.stack);
		                        } else {
		                            console.error("Warning: " + message, err.stack);
		                        }
		                        return deferred.resolve(false);
		                    }
		                    if (res.statusCode === 204) {
		                        return deferred.resolve(true);
		                    }
		                    return deferred.resolve(false);
		                });
		                return deferred.promise;
		            }
					*/
					return addresses;
	            }).fail(function(err) {
	            	if (!/^a\.domain\.that\.will\.never\.resolve\./.test(name)) {
	            		API.console.debug("Warning: Error looking up hostname '" + name + "':", err.stack);
		            }
	                return [];
	            });
	        }

	        var defaultIP = null;

            function normalizeIPs (ips) {
        		if (typeof ips === "string") {
        			ips = [ ips ];
        		}
                return ips.filter(function(ip) {
                    if (ip == defaultIP) return false;
                    return true;
                });
            }

			function lookupUnresolvingIP () {
		        return lookup("a.domain.that.will.never.resolve." + Date.now() + ".so.we.can.determine.default.ip.com").then(function(ips) {
		        	return ips[0] || null;
		        });
			}

			resolvedConfig.declared = resolvedConfig.declared || {};
			resolvedConfig.resolving = resolvedConfig.resolving || {};
			resolvedConfig.status = resolvedConfig.status || "unknown";

			return lookupUnresolvingIP().then(function (ip) {
				defaultIP = ip;

	            var all = [];
	            records = Object.keys(records).map(function(name) {
	                resolvedConfig.declared[name] = records[name];
	                if (/:/.test(name)) {
		                all.push(lookup(records[name].data).then(function(ips) {
		                    resolvedConfig.resolving[name] = normalizeIPs(ips);
		                }));
	                } else {
		                all.push(lookup(name).then(function(ips) {
		                    resolvedConfig.resolving[name] = normalizeIPs(ips);
		                }));
	                }
	                return {
	                    domain: records[name].domain,
	                    type: records[name].type,
	                    name: name,
	                    data: records[name].data
	                };
	            });

	            var hostsFileData = API.FS.readFileSync("/etc/hosts", "utf8");

	            return API.Q.all(all).then(function() {

	            	function isInHostsFile (ip, host) {
		                try {
		                    var re = new RegExp("\\n" + API.ESCAPE_REGEXP_COMPONENT(ip) + "\\s+" + API.ESCAPE_REGEXP_COMPONENT(host) + "\\s*\\n");
		                    if (re.test(hostsFileData)) {
		                        API.console.verbose("WARNING: Found entry mapping host '" + host + "' to ip '" + ip + "' in '/etc/hosts'!");
		                        return true;
		                    }
		                } catch(err) {
		                	API.console.verbose("Error looking up mapping in '/etc/hosts'", err.stack);
		                }
		                return false;
	            	}

					function resolveCNAME (host) {
			            return lookup(host).then(function(ips) {
		                    return normalizeIPs(ips);
		                });
					}

					function resolveA (host) {
						return lookup(host).then(function(ips) {
		                    return normalizeIPs(ips);
		                });
					}

					function resolveMX (host) {
						return lookup(host, "MX").then(function(ips) {
		                    return normalizeIPs(ips);
			           	});
					}

					var done = API.Q.resolve();

	                // Based on gathered info summarize the status.
	                var diff = 0;
	                for (var name in resolvedConfig.declared) {
	                    function resolve (name) {
		                    diff += 1;
		                    if (resolvedConfig.resolving[name].length === 0) {
		                    	return;
		                    }
	                    	done = API.Q.when(done, function () {

		                    	function isEqual (ips) {
		                    		if (typeof ips === "string") {
		                    			ips = [ ips ];
		                    		}
		                    		var found = false;
		                    		ips.forEach(function (ip) {
		                    			if (found) return;
				                    	if (resolvedConfig.resolving[name].indexOf(ip) >= 0) {
				                    		found = true;
				                    	}
		                    		});
		                    		if (found) {
				                        diff -= 1;
		                    		}
		                    	}
			                    if (resolvedConfig.declared[name].type === "A") {
			                    	return isEqual(resolvedConfig.declared[name].data);
			                    } else
			                    if (resolvedConfig.declared[name].type === "CNAME") {
			                    	return resolveCNAME(resolvedConfig.declared[name].data).then(function (ips) {
				                    	return isEqual(ips);
			                    	});
			                    } else
			                    if (resolvedConfig.declared[name].type === "MX") {
			                    	return resolveMX(resolvedConfig.declared[name].domain).then(function (ips) {
				                    	return isEqual(ips);
			                    	});
			                    } else {
			                    	throw new Error("Type '" + resolvedConfig.declared[name].type + "' not yet implemented!");
			                    }
	                    	});
   	                    }
		        		resolve(name);
	                }
	                return done.then(function () {
		                if (diff === 0) {
		                    resolvedConfig.status = "resolving";
		                } else {
		                    resolvedConfig.status = "pending";
		                }
	                });
	            });

			}).then(function () {

				return resolvedConfig;
			});
		});
	}

	exports.turn = function (resolvedConfig) {

		if (
			resolvedConfig.status === "ignore" ||
			resolvedConfig.status === "resolving" ||
			!resolvedConfig.declared ||
			Object.keys(resolvedConfig.declared).length === 0
		) {
			return;
		}

		function call (method, path, payload) {
			var deferred = API.Q.defer();
			API.REQUEST({
				method: method,
				url: "https://api.dnsimple.com/v1/" + path,
				json: true,
				body: payload || null,
				headers: {
					"X-DNSimple-Token": resolvedConfig.credentials.email + ":" + resolvedConfig.credentials.token
				}
			}, function(err, res, data) {
				if (err) return deferred.reject(err);
				return deferred.resolve(data);
			});
			return deferred.promise;
		}

		// @see https://github.com/pinf-logic/pinf.logic-for-dns
		return call("GET", "/domains").then(function(domains) {

			function prepareRecordsForComparison () {
				var recordsByDomainId = {};
				Object.keys(resolvedConfig.declared).forEach(function(recordId) {
					var record = resolvedConfig.declared[recordId];
					record.name = recordId;
					var domainId = null;
					domains.forEach(function(domain) {
						if (domainId) return;
						domain = domain.domain;
						if (record.domain === domain.name || record.domain.substring(record.domain.length-domain.name.length-1) === "." + domain.name) {
							domainId = domain.id;
							record.name = record.name.replace(new RegExp("\\." + domain.name + "$"), "");
							if (record.type === "A" && record.domain == record.name) {
								record.name = "";
							} else
							if (record.type === "MX") {
								record.name = "";
							}
						}
					});
					if (!domainId) {
						throw new Error("Unable to find domain `" + record.domain + "`. Looks like top-level DNS record for the domain is not provisioned!");
					}
					if (!recordsByDomainId[domainId]) {
						recordsByDomainId[domainId] = [];
					}
					recordsByDomainId[domainId].push(record);
				});
				return recordsByDomainId;
			}

			var recordsByDomainId = prepareRecordsForComparison();

			var done = API.Q.resolve();
			Object.keys(recordsByDomainId).forEach(function(domainId) {
				done = API.Q.when(done, function() {
					return call("GET", "/domains/" + domainId + "/records").then(function(existingRecords) {

						var done = API.Q.resolve();

						recordsByDomainId[domainId].filter(function(record) {
							return (existingRecords.filter(function(existingRecord) {
								existingRecord = existingRecord.record;
								if (
									record.type === existingRecord.record_type &&
									record.name === existingRecord.name
								) {
									if (record.data === existingRecord.content) {
										return true;
									}
									record._needsUpdate = existingRecord.id;
								};
								return false;
							}).length === 0);
						}).forEach(function(createRecord) {
							done = API.Q.when(done, function() {
								var data = {
									name: createRecord.name,
									record_type: createRecord.type,
									content: createRecord.data
								};
								if (createRecord.type === "MX") {
									data.prio = createRecord.prio;
								}
								if (createRecord._needsUpdate) {
									API.console.verbose(("Updating DNS record: " + JSON.stringify(createRecord)).magenta);
									return call("PUT", "/domains/" + domainId + "/records/" + createRecord._needsUpdate, {
										record: data
									});
								}
								API.console.verbose(("Creating DNS record: " + JSON.stringify(createRecord)).magenta);
								return call("POST", "/domains/" + domainId + "/records", {
									record: data
								});
							});
						});
						return done;
					});
				});
			});
			return done;
		});
	}

	return exports;
}
