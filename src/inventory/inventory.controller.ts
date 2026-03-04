import { Controller, Get, Query } from '@nestjs/common';
import { InventoryService, InventoryOverview } from './inventory.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getInventory(@Query() query: InventoryQueryDto): Promise<InventoryOverview> {
    return this.inventoryService.getOverview(query);
  }
}
