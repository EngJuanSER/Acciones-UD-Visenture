import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule, TitleCasePipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProfileService } from '../../services/profile.service';
import { Order, Commission } from '../../models/order.model';

@Component({
  selector: 'app-historical',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule, // <-- Añadido
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TitleCasePipe,
    CurrencyPipe,
    DatePipe
  ],
  templateUrl: './historical.component.html',
  styleUrls: ['./historical.component.css']
})
export class HistoricalComponent implements OnInit, OnDestroy, AfterViewInit {
  isLoading = true;
  dataSource = new MatTableDataSource<Order>();
  displayedColumns: string[] = ['create_at', 'symbol', 'side', 'type', 'qty', 'limit_price', 'stop_price', 'status', 'filled_avg_price', 'commission', 'total', 'actions'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Paginación
  pageSize = 5;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 100];
  totalOrders = 0;

  private fullOrderHistory: Order[] = [];
  private filteredOrderHistory: Order[] = [];
  private destroy$ = new Subject<void>();

  filterForm: FormGroup;

  constructor(
    private profileService: ProfileService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      symbol: [''],
      side: [''],
      sort: ['date_desc']
    });
  }

  ngOnInit(): void {
    this.loadOrdersHistory();
    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      // Al filtrar, siempre volvemos a la primera página
      if (this.dataSource.paginator) {
        this.dataSource.paginator.firstPage();
      }
      this.applyFiltersAndSorting();
    });
  }

  ngAfterViewInit(): void {
    // No vinculamos el paginador directamente, lo manejaremos manualmente.
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadOrdersHistory(): void {
    this.isLoading = true;
    this.profileService.getOrdersHistory().subscribe({
      next: (data) => {
        this.fullOrderHistory = data;
        this.applyFiltersAndSorting();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar el historial de órdenes:', err);
        this.isLoading = false;
        this.snackBar.open('No se pudo cargar el historial de órdenes.', 'Cerrar', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  applyFiltersAndSorting(): void {
    const { symbol, side, sort } = this.filterForm.value;
    let filteredData = [...this.fullOrderHistory];

    if (symbol) {
      const symbolFilter = symbol.trim().toLowerCase();
      filteredData = filteredData.filter(order =>
        order.share.symbol.toLowerCase().includes(symbolFilter)
      );
    }
    if (side) {
      filteredData = filteredData.filter(order => order.side === side);
    }

    const sortedData = filteredData;
    switch (sort) {
      case 'date_desc':
        sortedData.sort((a, b) => new Date(b.create_at).getTime() - new Date(a.create_at).getTime());
        break;
      case 'date_asc':
        sortedData.sort((a, b) => new Date(a.create_at).getTime() - new Date(b.create_at).getTime());
        break;
      case 'symbol_asc':
        sortedData.sort((a, b) => a.share.symbol.localeCompare(b.share.symbol));
        break;
      case 'symbol_desc':
        sortedData.sort((a, b) => b.share.symbol.localeCompare(a.share.symbol));
        break;
    }

    this.filteredOrderHistory = sortedData;
    this.totalOrders = this.filteredOrderHistory.length;
    this.pageIndex = 0;
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    this.updateDisplayedOrders();
  }

  updateDisplayedOrders(): void {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.dataSource.data = this.filteredOrderHistory.slice(startIndex, endIndex);
  }

  handlePageEvent(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updateDisplayedOrders();
  }

  canBeCancelled(order: Order): boolean {
    const cancellableStatus = ['accepted', 'done_for_day'];
    return cancellableStatus.includes(order.status);
  }

  cancelOrder(order: Order): void {
    const confirmation = window.confirm(`¿Estás seguro de que deseas cancelar la orden para ${order.qty} acciones de ${order.share.symbol}?`);
    
    if (confirmation) {
      this.profileService.cancelOrderById(order.id).subscribe({
        next: () => {
          this.snackBar.open('Orden cancelada exitosamente.', 'Cerrar', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadOrdersHistory();
        },
        error: (err) => {
          console.error('Error al cancelar la orden:', err);
          this.snackBar.open(`Error al cancelar la orden: ${err.error?.message || 'Error desconocido'}`, 'Cerrar', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      });
    }
  }

  getTotalCommission(commissions: Commission[]): number {
    if (!commissions || commissions.length === 0) {
      return 0;
    }
    return commissions.reduce((total, current) => total + current.ammount_commission, 0);
  }
}
