'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// ----------------------
// ZOD FORM SCHEMA
// ----------------------
const formSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

// Remove fields depending on the action
const createInvoiceSchema = formSchema.omit({ id: true, date: true });
const updateInvoiceSchema = formSchema.omit({ id: true, date: true });

// ----------------------
// TYPE FOR FORM STATE
// ----------------------
export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

// ----------------------
// AUTHENTICATION ACTION
// ----------------------
export async function authenticate(
  prevState: string | undefined,
  formData: FormData
): Promise<string> {
  try {
    await signIn('credentials', formData);
    return 'Success';
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

// ----------------------
// CREATE INVOICE ACTION
// ----------------------
export async function createInvoice(
  prevState: State,
  formData: FormData
): Promise<State> {
  // Normalize FormData values before validation
  const rawCustomer = formData.get('customerId');
  const rawAmount = formData.get('amount');
  const rawStatus = formData.get('status');

  const validatedFields = createInvoiceSchema.safeParse({
    customerId: rawCustomer?.toString(),
    amount: rawAmount != null ? Number(rawAmount.toString()) : undefined,
    status: rawStatus?.toString(),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;

  try {
    // Convert possible undefined -> null for postgres.js template params
    const customerIdParam = customerId ?? null;
    const amountParam = amount ?? null;
    const statusParam = status ?? null;

    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerIdParam}, ${amountParam}, ${statusParam}, now())
    `;
    revalidatePath('/invoices');
    return { message: 'Invoice created successfully' };
  } catch (error: any) {
    return { message: `Error creating invoice: ${error.message}` };
  }
}

// ----------------------
// UPDATE INVOICE ACTION
// ----------------------
// NOTE: signature is (id, prevState, formData) so binding id on the client produces
// a function with the shape (prevState, formData) required by useActionState.
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
): Promise<State> {
  if (!id) return { message: 'Invoice ID is required.' };

  // Normalize inputs from FormData
  const rawCustomer = formData.get('customerId');
  const rawAmount = formData.get('amount');
  const rawStatus = formData.get('status');

  const validatedFields = updateInvoiceSchema.safeParse({
    customerId: rawCustomer?.toString(),
    amount: rawAmount != null ? Number(rawAmount.toString()) : undefined,
    status: rawStatus?.toString(),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing fields. Failed to update invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;

  // Convert undefined -> null so postgres.js isn't given `undefined`
  const customerIdParam = customerId ?? null;
  const amountParam = amount ?? null;
  const statusParam = status ?? null;

  try {
    await sql`
      UPDATE invoices
      SET
        customer_id = COALESCE(${customerIdParam}, customer_id),
        amount = COALESCE(${amountParam}, amount),
        status = COALESCE(${statusParam}, status)
      WHERE id = ${id}
    `;
    revalidatePath('/invoices');
    return { message: 'Invoice updated successfully' };
  } catch (error: any) {
    return { message: `Error updating invoice: ${error.message}` };
  }
}

// ----------------------
// DELETE INVOICE ACTION
// ----------------------
export async function deleteInvoice(id: string): Promise<State> {
  if (!id) return { message: 'Invoice ID is required.' };

  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/invoices');
    return { message: 'Invoice deleted successfully' };
  } catch (error: any) {
    return { message: `Error deleting invoice: ${error.message}` };
  }
}
