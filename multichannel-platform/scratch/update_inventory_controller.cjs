const fs = require('fs');
let code = fs.readFileSync('services/api/src/modules/inventory/inventory.controller.ts', 'utf8');

// 1. Add EbayService import
if (!code.includes("import { EbayService }")) {
  code = code.replace(
    "import { ShopifyService } from '../../services/shopify.service';",
    "import { ShopifyService } from '../../services/shopify.service';\nimport { EbayService } from '../../services/ebay.service';"
  );
}

// 2. Add real-time channel propagation to adjust method
const oldAdjustReturn = `      logger.info(
        \`Inventory & details updated for SKU \${item.sku}: stock \${previousStock} -> \${newStock}, retailPrice: \${retailPrice}, reason: \${reason}\`
      );

      return res.json({
        success: true,
        data: item,
      });`;

const newAdjustReturn = `      logger.info(
        \`Inventory & details updated for SKU \${item.sku}: stock \${previousStock} -> \${newStock}, retailPrice: \${retailPrice}, reason: \${reason}\`
      );

      // Automatically propagate stock and price adjustments to mapped channels (eBay, Shopify)
      try {
        const mappings = await ProductMapping.find({
          organizationId: req.tenantId,
          canonicalVariantId: item.canonicalVariantId,
          status: MappingStatus.MAPPED,
        })
          .populate('channelConnectionId')
          .populate('channelProductId')
          .lean();

        for (const m of mappings) {
          const conn: any = m.channelConnectionId;
          const chProd: any = m.channelProductId;
          if (!conn || conn.status !== ChannelStatus.ACTIVE) continue;

          const finalPrice = retailPrice !== undefined ? Number(retailPrice) : (variant?.retailPrice || chProd?.price || 0);

          if (conn.channelType === ChannelType.EBAY && chProd?.sku) {
            try {
              const { host, token } = await EbayService.getValidCredentials(conn);
              const setResult = await EbayService.setInventoryItem(host, token, chProd.sku, {
                title: chProd.title,
                quantity: item.availableToAllocate,
                price: finalPrice,
                marketplaceId: conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined),
              });
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  inventoryQuantity: item.availableToAllocate,
                  price: finalPrice,
                  lastSyncedAt: new Date(),
                  ...(setResult.listingId ? { externalProductId: setResult.listingId } : {}),
                },
              });
              logger.info(\`Auto-propagated inventory & price to eBay for SKU \${chProd.sku} (stock: \${item.availableToAllocate}, price: \${finalPrice})\`);
            } catch (ebayErr: any) {
              logger.warn(\`Failed to auto-sync inventory to eBay for SKU \${chProd.sku}: \${ebayErr.message}\`);
            }
          } else if (conn.channelType === ChannelType.SHOPIFY && chProd) {
            try {
              const { domain, token } = ShopifyService.getCredentials(conn);
              const invItemId = chProd.rawPayload?.variant?.inventory_item_id;
              if (invItemId) {
                await ShopifyService.setInventoryLevel(domain, token, String(invItemId), item.availableToAllocate);
              }
              if (retailPrice !== undefined && chProd.externalVariantId) {
                await ShopifyService.updateVariantPrice(domain, token, chProd.externalVariantId, finalPrice);
              }
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  inventoryQuantity: item.availableToAllocate,
                  price: finalPrice,
                  lastSyncedAt: new Date(),
                },
              });
              logger.info(\`Auto-propagated inventory & price to Shopify for SKU \${chProd.sku}\`);
            } catch (shErr: any) {
              logger.warn(\`Failed to auto-sync inventory to Shopify for SKU \${chProd.sku}: \${shErr.message}\`);
            }
          }
        }
      } catch (propErr: any) {
        logger.error(\`Error propagating inventory adjustment to channels: \${propErr.message}\`);
      }

      return res.json({
        success: true,
        data: item,
      });`;

if (code.includes(oldAdjustReturn)) {
  code = code.replace(oldAdjustReturn, newAdjustReturn);
} else {
  console.log('WARNING: oldAdjustReturn not found in inventory.controller.ts');
}

// 3. Update syncChannels eBay section
const oldEbaySync = `        // EBAY SYNC (Supports custom pricing to account for higher eBay fees)
        else if (conn.channelType === ChannelType.EBAY) {
          const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;

          let mapping = await ProductMapping.findOne({
            organizationId: req.tenantId,
            canonicalVariantId: variant._id,
            channelConnectionId: conn._id,
          }).populate('channelProductId');

          let channelProd: any = mapping?.channelProductId;
          if (!channelProd) {
            channelProd = await ChannelProduct.create({
              organizationId: req.tenantId,
              channelConnectionId: conn._id,
              channelType: ChannelType.EBAY,
              externalProductId: \`EBAY-\${variant.sku}\`,
              externalVariantId: \`EBAY-VAR-\${variant.sku}\`,
              title: \`\${canonicalProduct?.title || variant.title} (eBay Listing)\`,
              sku: variant.sku,
              price: targetPrice,
              inventoryQuantity: item.availableToAllocate,
              status: ChannelProductStatus.ACTIVE,
              syncStatus: SyncStatus.SYNCED,
              lastSyncedAt: new Date(),
              rawPayload: { ebayFeeBufferApplied: true, markupPercent: ebayMarkupPercent || 0 },
            });

            await ProductMapping.create({
              organizationId: req.tenantId,
              canonicalProductId: variant.canonicalProductId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
              channelProductId: channelProd._id,
              channelType: ChannelType.EBAY,
              priceModifier: { type: 'FIXED', value: targetPrice },
              syncPrice: true,
              syncInventory: true,
              status: MappingStatus.MAPPED,
            });
          } else {
            channelProd.price = targetPrice;
            channelProd.inventoryQuantity = item.availableToAllocate;
            channelProd.syncStatus = SyncStatus.SYNCED;
            channelProd.lastSyncedAt = new Date();
            channelProd.rawPayload = {
              ...channelProd.rawPayload,
              ebayFeeBufferApplied: true,
              markupPercent: ebayMarkupPercent || 0,
            };
            await channelProd.save();

            mapping!.priceModifier = { type: 'FIXED', value: targetPrice };
            mapping!.updatedAt = new Date();
            await mapping!.save();
          }

          results.push({
            channel: conn.name,
            channelType: conn.channelType,
            status: 'SYNCED',
            price: targetPrice,
            stock: item.availableToAllocate,
            note: 'eBay custom fee-adjusted price applied successfully',
          });
        }`;

const newEbaySync = `        // EBAY SYNC (Live eBay Inventory API push + strict mapping)
        else if (conn.channelType === ChannelType.EBAY) {
          const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;
          try {
            const { host, token } = await EbayService.getValidCredentials(conn);
            const marketplaceId = conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : 'EBAY_GB');
            const images = (canonicalProduct?.images || []).map((img: any) => typeof img === 'string' ? img : img.url).filter(Boolean);

            const setResult = await EbayService.setInventoryItem(host, token, variant.sku, {
              title: canonicalProduct?.title || variant.title,
              description: canonicalProduct?.description || variant.title,
              quantity: item.availableToAllocate,
              price: targetPrice,
              images,
              brand: canonicalProduct?.brand || 'Generic',
              marketplaceId,
            });

            if (!setResult.success) {
              throw new Error(setResult.error || \`Failed to push SKU \${variant.sku} to eBay\`);
            }

            const listingId = setResult.listingId || variant.sku;

            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            let channelProd: any = mapping?.channelProductId;
            if (!channelProd) {
              channelProd = await ChannelProduct.create({
                organizationId: req.tenantId,
                channelConnectionId: conn._id,
                channelType: ChannelType.EBAY,
                externalProductId: listingId,
                externalVariantId: variant.sku,
                title: canonicalProduct?.title || variant.title,
                sku: variant.sku,
                price: targetPrice,
                inventoryQuantity: item.availableToAllocate,
                status: ChannelProductStatus.ACTIVE,
                syncStatus: SyncStatus.SYNCED,
                lastSyncedAt: new Date(),
                rawPayload: { listingId, offerId: setResult.offerId, markupPercent: ebayMarkupPercent || 0 },
              });

              await ProductMapping.create({
                organizationId: req.tenantId,
                canonicalProductId: variant.canonicalProductId,
                canonicalVariantId: variant._id,
                channelConnectionId: conn._id,
                channelProductId: channelProd._id,
                channelType: ChannelType.EBAY,
                priceModifier: { type: 'FIXED', value: targetPrice },
                syncPrice: true,
                syncInventory: true,
                status: MappingStatus.MAPPED,
              });
            } else {
              channelProd.externalProductId = listingId;
              channelProd.price = targetPrice;
              channelProd.inventoryQuantity = item.availableToAllocate;
              channelProd.syncStatus = SyncStatus.SYNCED;
              channelProd.lastSyncedAt = new Date();
              channelProd.rawPayload = {
                ...channelProd.rawPayload,
                listingId,
                offerId: setResult.offerId || channelProd.rawPayload?.offerId,
                markupPercent: ebayMarkupPercent || 0,
              };
              await channelProd.save();

              mapping!.status = MappingStatus.MAPPED;
              mapping!.priceModifier = { type: 'FIXED', value: targetPrice };
              mapping!.updatedAt = new Date();
              await mapping!.save();
            }

            conn.lastSyncAt = new Date();
            await conn.save();

            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'SYNCED',
              price: targetPrice,
              stock: item.availableToAllocate,
              listingId,
              note: 'Successfully pushed and synchronized to eBay',
            });
          } catch (ebayErr: any) {
            logger.error(\`Failed to sync variant \${variant.sku} to eBay: \${ebayErr.message}\`);
            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: ebayErr.message,
            });
          }
        }`;

if (code.includes(oldEbaySync)) {
  code = code.replace(oldEbaySync, newEbaySync);
  console.log('SUCCESS: syncChannels eBay updated!');
} else {
  console.log('WARNING: oldEbaySync not found in inventory.controller.ts');
}

fs.writeFileSync('services/api/src/modules/inventory/inventory.controller.ts', code, 'utf8');
console.log('SUCCESS: inventory.controller.ts updated successfully!');
