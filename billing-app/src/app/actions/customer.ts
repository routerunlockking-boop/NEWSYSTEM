'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getCustomers() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: customers };
  } catch (error) {
    return { success: false, error: 'Failed to fetch customers' };
  }
}

export async function addCustomer(data: { name: string; phone: string; email?: string; address?: string }) {
  try {
    const customer = await prisma.customer.create({
      data,
    });
    revalidatePath('/customers');
    revalidatePath('/new-bill');
    return { success: true, data: customer };
  } catch (error) {
    return { success: false, error: 'Failed to create customer' };
  }
}
