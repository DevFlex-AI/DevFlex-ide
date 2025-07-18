/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IFileService } from '../../files/common/files.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { AbstractExtensionResourceLoaderService, IExtensionResourceLoaderService } from '../common/extensionResourceLoader.js';
import { isWeb } from '../../../base/common/platform.js';

/**
 * Modifies the given URL to route through a CORS proxy.
 */
export const corsEnableUrl = (url: string) => {
	if (!isWeb) { return URI.parse(url); }
	const baseUrlObject = new URL(url);
	baseUrlObject.protocol = 'https:';
	baseUrlObject.port = '';
	baseUrlObject.pathname = '/' + baseUrlObject.hostname + baseUrlObject.pathname;
	baseUrlObject.hostname = 'cors-proxy.DevFlex.ai';
	return URI.parse(baseUrlObject.toString());
};

class ExtensionResourceLoaderService extends AbstractExtensionResourceLoaderService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(fileService, storageService, productService, environmentService, configurationService);
	}

	async readExtensionResource(uri: URI): Promise<string> {
		uri = FileAccess.uriToBrowserUri(uri);

		if (uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && uri.scheme !== Schemas.data) {
			const result = await this._fileService.readFile(uri);
			return result.value.toString();
		}

		const requestInit: RequestInit = {};
		if (this.isExtensionGalleryResource(uri)) {
			requestInit.headers = await this.getExtensionGalleryRequestHeaders();
			requestInit.mode = 'cors'; /* set mode to cors so that above headers are always passed */
		}

		const requestUrl = new URL(uri.toString(true));
		const CORS_SKIP_HOSTS = ['localhost', 'ide.DevFlex.ai', 'cors-proxy.DevFlex.ai'];
		if (!CORS_SKIP_HOSTS.includes(requestUrl.hostname)) {
			uri = corsEnableUrl(uri.toString(true));
		}

		const response = await fetch(uri.toString(true), requestInit);
		if (response.status !== 200) {
			this._logService.info(`Request to '${uri.toString(true)}' failed with status code ${response.status}`);
			throw new Error(response.statusText);
		}
		return response.text();
	}
}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService, InstantiationType.Delayed);
