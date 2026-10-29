const fs = require('fs');
let code = fs.readFileSync('services/api/src/modules/products/products.controller.ts', 'utf8');

const targetMethod = `      await NotificationService.notifyProductModified({
        organizationId: req.tenantId,
        productTitle: product.title,
        source: 'Platform Catalog Editor',
        changesSummary: \`Updated status: \${product.status}, default retail price: $\${product.defaultRetailPrice}.\`,
        link: '/products',
      });

      return res.json({
        success: true,
        data: product,
      });`;

const replacement = `      await NotificationService.notifyProductModified({
        organizationId: req.tenantId,
        productTitle: product.title,
        source: 'Platform Catalog Editor',
        changesSummary: \`Updated status: \${product.status}, default retail price: $\${product.defaultRetailPrice}.\`,
        link: '/products',
      });

      // Automatically propagate updates to mapped channels (eBay, Shopify) for real-time consistency
      try {
        const mappings = await ProductMapping.find({
          organizationId: req.tenantId,
          canonicalProductId: product._id,
          status: MappingStatus.MAPPED,
        })
          .populate('channelConnectionId')
          .populate('channelProductId')
          .lean();

        for (const m of mappings) {
          const conn: any = m.channelConnectionId;
          const chProd: any = m.channelProductId;
          if (!conn || conn.status !== ChannelStatus.ACTIVE) continue;

          if (conn.channelType === ChannelType.EBAY && chProd?.sku) {
            try {
              const { host, token } = await EbayService.getValidCredentials(conn);
              const invItem = await InventoryItem.findOne({
                organizationId: req.tenantId,
                canonicalVariantId: m.canonicalVariantId,
              });
              await EbayService.setInventoryItem(host, token, chProd.sku, {
                title: product.title,
                description: product.description || product.title,
                quantity: invItem?.availableToAllocate ?? chProd.inventoryQuantity ?? 0,
                price: product.defaultRetailPrice || chProd.price,
                images: (product.images || []).map((img: any) => typeof img === 'string' ? img : img.url).filter(Boolean),
                brand: product.brand,
                marketplaceId: conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined),
              });
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  title: product.title,
                  price: product.defaultRetailPrice || chProd.price,
                  lastSyncedAt: new Date(),
                },
              });
              logger.info(\`Auto-propagated product update to eBay for SKU \${chProd.sku}\`);
            } catch (ebayErr: any) {
              logger.warn(\`Failed to auto-propagate product update to eBay for SKU \${chProd.sku}: \${ebayErr.message}\`);
            }
          } else if (conn.channelType === ChannelType.SHOPIFY && chProd?.externalProductId) {
            try {
              const { domain, token } = ShopifyService.getCredentials(conn);
              await ShopifyService.updateProduct(domain, token, chProd.externalProductId, {
                title: product.title,
                description: product.description,
                brand: product.brand,
                category: product.category,
                tags: product.tags,
                images: (product.images || []).map((img: any) => typeof img === 'string' ? img : img.url),
              });
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  title: product.title,
                  lastSyncedAt: new Date(),
                },
              });
              logger.info(\`Auto-propagated product update to Shopify for product \${chProd.externalProductId}\`);
            } catch (shErr: any) {
              logger.warn(\`Failed to auto-propagate product update to Shopify: \${shErr.message}\`);
            }
          }
        }
      } catch (propErr: any) {
        logger.error(\`Error auto-propagating product update to channels: \${propErr.message}\`);
      }

      return res.json({
        success: true,
        data: product,
      });`;

if (code.includes(targetMethod)) {
  code = code.replace(targetMethod, replacement);
  fs.writeFileSync('services/api/src/modules/products/products.controller.ts', code, 'utf8');
  console.log('SUCCESS: products.controller.ts updated successfully!');
} else {
  console.log('ERROR: targetMethod not found in products.controller.ts');
}
