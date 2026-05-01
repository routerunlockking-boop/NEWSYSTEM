'use server';

import { prisma } from '@/lib/prisma';

export async function getProductByBarcode(barcode: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { barcode },
    });
    if (!product) return { success: false, error: 'Product not found' };
    return { success: true, data: product };
  } catch (error) {
    console.error('Error fetching product:', error);
    return { success: false, error: 'Failed to fetch product' };
  }
}

export async function addProduct(data: { name: string; barcode: string; price: number }) {
  try {
    const product = await prisma.product.create({
      data,
    });
    return { success: true, data: product };
  } catch (error) {
    console.error('Error adding product:', error);
    return { success: false, error: 'Failed to create product' };
  }
}
