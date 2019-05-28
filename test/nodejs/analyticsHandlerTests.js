/**
 * Copyright 2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');

const AnalyticsHandler = require('../../nodejs/analyticsHandler');

describe('analyticsHandler', () => {
    it('should handle declaration with no Common', () => {
        const handler = new AnalyticsHandler({});
        return handler.process();
    });

    it('should handle declaration with no Common.Analytics', () => {
        const declaration = {
            Common: {}
        };
        const handler = new AnalyticsHandler(declaration);
        return handler.process();
    });

    function makeAssertTranslate(key, expectKey) {
        return function assertTranslate(value, expectValue) {
            const declaration = {
                Common: { Analytics: {} }
            };
            declaration.Common.Analytics[key] = value;

            const bigip = {
                replace: (path, data) => {
                    assert.strictEqual(path, '/tm/analytics/global-settings');
                    assert.deepStrictEqual(data[expectKey], expectValue);
                    return Promise.resolve();
                }
            };

            const handler = new AnalyticsHandler(declaration, bigip);
            return handler.process();
        };
    }

    it('should translate debugEnabled', () => {
        const assertTranslate = makeAssertTranslate('debugEnabled', 'avrd-debug-mode');
        return Promise.resolve()
            .then(() => {
                return assertTranslate(true, 'enabled');
            })
            .then(() => {
                return assertTranslate(false, 'disabled');
            });
    });

    it('should translate interval', () => {
        const assertTranslate = makeAssertTranslate('interval', 'avrd-interval');
        return assertTranslate(60, 60);
    });

    it('should translate offboxProtocol', () => {
        const assertTranslate = makeAssertTranslate('offboxProtocol', 'offbox-protocol');
        return Promise.resolve()
            .then(() => {
                return assertTranslate('tcp', 'tcp');
            })
            .then(() => {
                return assertTranslate(undefined, 'none');
            });
    });

    it('should translate offboxTcpAddresses', () => {
        const assertTranslate = makeAssertTranslate('offboxTcpAddresses', 'offbox-tcp-addresses');
        return assertTranslate(['192.0.2.0'], ['192.0.2.0']);
    });

    it('should translate offboxTcpPort', () => {
        const assertTranslate = makeAssertTranslate('offboxTcpPort', 'offbox-tcp-port');
        return assertTranslate(80, 80);
    });

    it('should translate offboxEnabled', () => {
        const assertTranslate = makeAssertTranslate('offboxEnabled', 'use-offbox');
        return Promise.resolve()
            .then(() => {
                return assertTranslate(true, 'enabled');
            })
            .then(() => {
                return assertTranslate(false, 'disabled');
            });
    });
});
