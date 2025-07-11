import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { CommissionerService } from '../services/commissioner.service';
import { 
  CommissionerClient, 
  ClientKpi, 
  CommissionSummary, 
  CommissionerStats, 
  CommissionerFilters 
} from '../models/commissioner.model';
import { ClientSharePosition } from '../models/client-portfolio.model';

// Tipo para las gráficas
export type ChartOptions = {
  series: any[];
  chart: any;
  xaxis: any;
  yaxis: any;
  colors: any[];
  labels: any[];
  title: any;
  subtitle: any;
  theme: any;
  plotOptions: any;
  tooltip: any;
  dataLabels: any;
  legend: any;
  stroke: any;
  fill: any;
  grid: any;
};

@Component({
  selector: 'app-commissioner-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatTabsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    RouterModule,
    NgApexchartsModule
  ],
  templateUrl: './commissioner-panel.component.html',
  styleUrls: ['./commissioner-panel.component.css']
})
export class CommissionerPanelComponent implements OnInit, OnDestroy, AfterViewInit {
  // Variables para clientes
  displayedColumns: string[] = ['name', 'email', 'registration_date', 'status', 'total_investment', 'roi_percentage', 'last_operation_date', 'actions'];
  dataSource = new MatTableDataSource<CommissionerClient>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  
  // Variables para comisiones
  displayedColumnsCommissions: string[] = ['client_name', 'month', 'year', 'commissions_generated', 'operations_count', 'market', 'status', 'actions'];
  dataSourceCommissions = new MatTableDataSource<CommissionSummary>([]);
  @ViewChild('commissionsPaginator') commissionsPaginator!: MatPaginator;
  @ViewChild('commissionsSort') commissionsSort!: MatSort;
  
  // Variables para estadísticas
  commissionerStats!: CommissionerStats;
  
  // Gráficos
  clientDistributionChartOptions!: Partial<ChartOptions>;
  commissionsByMarketChartOptions!: Partial<ChartOptions>;
  commissionsTrendChartOptions!: Partial<ChartOptions>;
  roiDistributionChartOptions!: Partial<ChartOptions>;
  
  // Estado de la UI
  isLoading = true;
  isLoadingStats = true;
  isLoadingCommissions = true;
  error: string | null = null;
  currentTabIndex = 0; // Rastrear la pestaña actual
  
  // Filtros
  filterForm!: FormGroup;
  
  // Markets disponibles para filtrado
  markets: {value: string, label: string}[] = [
    { value: '', label: $localize`:@@commissioner.filters.market.all:Todos los mercados` },
    { value: 'US', label: $localize`:@@commissioner.filters.market.us:Estados Unidos` },
    { value: 'LATAM', label: $localize`:@@commissioner.filters.market.latam:Latinoamérica` },
    { value: 'EU', label: $localize`:@@commissioner.filters.market.eu:Europa` },
    { value: 'ASIA', label: $localize`:@@commissioner.filters.market.asia:Asia` }
  ];
  
  // Estados de cliente disponibles para filtrado
  statuses: {value: string, label: string}[] = [
    { value: '', label: $localize`:@@commissioner.filters.status.all:Todos los estados` },
    { value: 'active', label: $localize`:@@commissioner.filters.status.active:Activo` },
    { value: 'inactive', label: $localize`:@@commissioner.filters.status.inactive:Inactivo` },
    { value: 'pending', label: $localize`:@@commissioner.filters.status.pending:Pendiente` }
  ];
  
  private destroy$ = new Subject<void>();
  
  constructor(
    private commissionerService: CommissionerService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.createFilterForm();
  }
  
  ngOnInit(): void {
    // Detectar cambios de tema
    this.setupThemeObserver();
    
    // Cargar datos iniciales
    this.loadData();
    
    // Configurar gráficos
    this.initCharts();
    
    // Suscribirse a cambios en filtros
    this.setupFilterListeners();
  }
  
  ngAfterViewInit(): void {
    // Configurar paginadores y ordenadores después de que las vistas se inicialicen
    this.configureDataTable();
    
    // Forzar actualización de los gráficos para garantizar que se rendericen correctamente
    setTimeout(() => {
      this.updateCharts();
      
      // Actualizar el tema de los gráficos
      let isDark = document.documentElement.classList.contains('dark');
      this.updateChartsTheme(isDark);
      
      // Forzar detección de cambios para asegurar que las gráficas se rendericen
      this.cdr.detectChanges();
      
      // Segundo timeout para garantizar que las gráficas se rendericen después de que Angular haya procesado cambios
      setTimeout(() => {
        this.updateCharts();
        this.cdr.detectChanges();
      }, 300);
    }, 500);
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  loadData(forceRefresh = false): void {
    this.isLoading = true;
    this.error = null;
    
    // Obtener filtros actuales
    const filters: CommissionerFilters = this.getFiltersFromForm();
    
    // Cargar reporte completo
    this.commissionerService.getCommissionerReport(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.processClientData(response.data.clients);
            this.processCommissionData(response.data.commissions);
            this.processStatsData(response.data.statistics);
            this.updateCharts();
          } else {
            this.error = $localize`:@@commissioner.error.load.failed:No se pudieron cargar los datos. Intente nuevamente.`;
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error al cargar datos:', err);
          this.error = $localize`:@@commissioner.error.load.error:Ocurrió un error al cargar los datos. Intente nuevamente.`;
          this.isLoading = false;
        }
      });
  }
  
  private createFilterForm(): void {
    this.filterForm = this.fb.group({
      client_name: [''],
      market: [''],
      status: [''],
      date_range: this.fb.group({
        start: [null],
        end: [null]
      })
    });
  }
  
  private getFiltersFromForm(): CommissionerFilters {
    const formValue = this.filterForm.value;
    const filters: CommissionerFilters = {};
    
    if (formValue.client_name) {
      filters.client_name = formValue.client_name;
    }
    
    if (formValue.market) {
      filters.market = formValue.market;
    }
    
    if (formValue.status) {
      filters.status = formValue.status;
    }
    
    if (formValue.date_range?.start && formValue.date_range?.end) {
      filters.date_range = {
        start: formValue.date_range.start,
        end: formValue.date_range.end
      };
    }
    
    return filters;
  }
  
  private processClientData(clients: CommissionerClient[]): void {
    this.dataSource.data = clients;
  }
  
  private processCommissionData(commissions: CommissionSummary[]): void {
    this.dataSourceCommissions.data = commissions;
  }
  
  private processStatsData(stats: CommissionerStats): void {
    this.commissionerStats = stats;
  }
  
  private configureDataTable(): void {
    // Configurar tabla de clientes
    if(this.dataSource && this.paginator && this.sort) {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    }
    
    // Configurar tabla de comisiones
    if(this.dataSourceCommissions && this.commissionsPaginator && this.commissionsSort) {
      this.dataSourceCommissions.paginator = this.commissionsPaginator;
      this.dataSourceCommissions.sort = this.commissionsSort;
    }
  }
  
  /**
   * Configura los oyentes para los filtros en vivo
   * Cada vez que cambia un valor en el formulario, se ejecuta la búsqueda
   * después de un pequeño retraso para evitar múltiples solicitudes
   */
  private setupFilterListeners(): void {
    // Aplicar filtros automáticamente al cambiar los valores
    this.filterForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300), // Esperar 300ms después de que el usuario deje de escribir
        distinctUntilChanged((prev: any, curr: any) => JSON.stringify(prev) === JSON.stringify(curr)) // Evita peticiones duplicadas
      )
      .subscribe(() => {
        // Resetear paginadores
        if (this.paginator) {
          this.paginator.pageIndex = 0;
        }
        if (this.commissionsPaginator) {
          this.commissionsPaginator.pageIndex = 0;
        }
        
        // Cargar datos con los nuevos filtros
        this.loadData();
        
        // Actualizar los gráficos después de aplicar los filtros
        setTimeout(() => {
          this.updateCharts();
          const isDark = document.documentElement.classList.contains('dark');
          this.updateChartsTheme(isDark);
        }, 200);
      });
  }
  
  /**
   * Maneja el envío del formulario de filtros.
   * Este método se mantiene por compatibilidad, pero los filtros se aplican 
   * automáticamente gracias a la suscripción a valueChanges implementada en setupFilterListeners.
   */
  onFilterSubmit(): void {
    // Esta función se llama cuando el usuario presiona el botón "Aplicar"
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    if (this.commissionsPaginator) {
      this.commissionsPaginator.pageIndex = 0;
    }
    this.loadData(true);
  }
  
  resetFilters(): void {
    // Reiniciar todos los campos del formulario
    this.filterForm.reset({
      client_name: '',
      market: '',
      status: '',
      date_range: {
        start: null,
        end: null
      }
    });
    
    // No es necesario llamar a loadData aquí, ya que el valueChanges del form lo disparará
  }
  
  viewClientDetails(client: any): void {
    // Navegamos a la vista de detalle del cliente
    const clientId = client.id || client.client_id;
    if (clientId) {
      this.router.navigate(['/commissioner-panel/client', clientId]);
    } else {
      this.snackBar.open('No se pudo encontrar el ID del cliente', 'Cerrar', {
        duration: 3000
      });
    }
  }
  
  viewClientReport(clientId: number, clientName: string): void {
    // Navegamos a la vista de detalle del cliente pasando el id
    this.router.navigate(['/commissioner-panel/client', clientId]);
  }
  
  exportData(format: 'csv' | 'pdf' | 'excel'): void {
    const filters = this.getFiltersFromForm();
    this.commissionerService.exportReport(format, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          // Crear URL del blob y descargarlo
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reporte_comisionista_${new Date().toISOString().split('T')[0]}.${format}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
          
          this.snackBar.open(`Reporte exportado en formato ${format.toUpperCase()}`, 'Cerrar', {
            duration: 3000
          });
        },
        error: (err) => {
          console.error('Error al exportar datos:', err);
          this.snackBar.open('Error al exportar datos', 'Cerrar', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      });
  }
  
  /**
   * Inicializa completamente los gráficos desde cero
   * Esta versión es más robusta y está diseñada para resolver problemas de renderizado
   */
  private initCharts(): void {
    console.log('[CommissionerPanel] Complete chart initialization from scratch');
    
    // Detectar tema actual cada vez
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e5e7eb';
    
    // Genera IDs únicos para cada gráfico para evitar conflictos
    const chartId1 = `chart-${new Date().getTime()}-1`;
    const chartId2 = `chart-${new Date().getTime()}-2`;
    
    // Asegurarse de que tenemos estadísticas para inicializar los gráficos
    if (!this.commissionerStats) {
      console.warn('[CommissionerPanel] No statistics available for chart initialization');
      // En lugar de retornar, inicializamos con datos vacíos que se pueden actualizar después
      this.commissionerStats = this.getEmptyStatistics();
    }
    
    this.clientDistributionChartOptions = {
      series: [],
      chart: {
        type: 'donut',
        height: 300,
        toolbar: {
          show: false
        },
        animations: {
          enabled: true,
          speed: 300
        },
        fontFamily: 'Inter, sans-serif',
        background: 'transparent',
        foreColor: textColor
      },
      colors: ['#10B981', '#F59E0B', '#EF4444'],
      labels: ['Activos', 'Pendientes', 'Inactivos'],
      dataLabels: {
        enabled: true,
        formatter: function(val: number) {
          return Math.round(val) + '%';
        },
        style: {
          colors: [textColor]
        }
      },
      plotOptions: {
        pie: {
          donut: {
            size: '55%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Total',
                formatter: function(w: any) {
                  return w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
                },
                color: textColor
              }
            }
          }
        }
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        labels: {
          colors: textColor
        },
        fontFamily: 'Inter, sans-serif'
      },
      theme: {
        mode: isDark ? 'dark' : 'light'
      }
    };

    this.commissionsByMarketChartOptions = {
      series: [],
      chart: {
        type: 'bar',
        height: 300,
        toolbar: {
          show: false
        },
        animations: {
          enabled: true,
          speed: 300
        },
        fontFamily: 'Inter, sans-serif',
        background: 'transparent',
        foreColor: textColor
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          endingShape: 'rounded',
          borderRadius: 4,
          distributed: false
        },
      },
      colors: ['#10B981'],
      dataLabels: {
        enabled: false
      },
      stroke: {
        show: true,
        width: 2,
        colors: ['transparent']
      },
      xaxis: {
        categories: [],
        labels: {
          style: {
            colors: Array(10).fill(textColor)
          }
        },
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        }
      },
      yaxis: {
        title: {
          text: 'Comisiones ($)',
          style: {
            color: subtitleColor,
            fontFamily: 'Inter, sans-serif'
          }
        },
        labels: {
          formatter: function(val: number) {
            return '$' + val.toFixed(0);
          },
          style: {
            colors: textColor
          }
        }
      },
      fill: {
        opacity: 0.85
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        y: {
          formatter: function(val: number) {
            return '$ ' + val.toFixed(2);
          }
        }
      },
      grid: {
        borderColor: gridColor,
        strokeDashArray: 4,
        yaxis: {
          lines: {
            show: true
          }
        }
      },
      theme: {
        mode: isDark ? 'dark' : 'light'
      }
    };
    
    // Configurar más gráficos aquí
  }
  
  /**
   * Actualiza los datos y la visualización de todos los gráficos
   * Implementa una estrategia robusta para asegurar que los gráficos se rendericen correctamente
   */
  /**
   * Actualiza los datos y la visualización de todos los gráficos
   * Método mejorado con mejor manejo de errores y logging
   */
  private updateCharts(): void {
    // Verificar si tenemos estadísticas
    if (!this.commissionerStats) {
      console.warn('[CommissionerPanel] No hay estadísticas disponibles para actualizar las gráficas.');
      return;
    }

    console.log('[CommissionerPanel] Actualizando datos de gráficas');
    
    try {
      // Actualizar gráfico de distribución de clientes
      if (this.clientDistributionChartOptions && this.clientDistributionChartOptions.series) {
        console.log('[CommissionerPanel] Actualizando gráfico de distribución de clientes');
        
        const activeClients = this.commissionerStats.active_clients || 0;
        const totalClients = this.commissionerStats.total_clients || 0;
        const negativeRoiClients = this.commissionerStats.clients_with_negative_roi || 0;
        const inactiveClients = Math.max(0, totalClients - activeClients - negativeRoiClients);
        
        this.clientDistributionChartOptions.series = [
          activeClients,
          inactiveClients,
          negativeRoiClients
        ];
        
        console.log(`[CommissionerPanel] Datos del gráfico de distribución: [${activeClients}, ${inactiveClients}, ${negativeRoiClients}]`);
      } else {
        console.warn('[CommissionerPanel] El gráfico de distribución de clientes no está inicializado correctamente');
      }
      
      // Actualizar gráfico de comisiones por mercado
      if (this.commissionsByMarketChartOptions && this.commissionsByMarketChartOptions.series) {
        const marketAmounts = this.commissionerStats.commissions_by_market.map(m => m.amount);
        const marketLabels = this.commissionerStats.commissions_by_market.map(m => m.market);
        
        this.commissionsByMarketChartOptions.series = [{
          name: 'Comisiones',
          data: marketAmounts
        }];
        
        if (this.commissionsByMarketChartOptions.xaxis) {
          this.commissionsByMarketChartOptions.xaxis.categories = marketLabels;
        }
      }
      
      // Actualizar tendencia de comisiones si existe ese gráfico y los datos correspondientes
      if (this.commissionsTrendChartOptions && this.commissionsTrendChartOptions.series) {
        // Usar casting a any para evitar errores de tipado
        const statsAny = this.commissionerStats as any;
        
        if (statsAny.hasOwnProperty('monthly_commissions') && 
            Array.isArray(statsAny.monthly_commissions) && 
            statsAny.monthly_commissions.length > 0) {
          
          const monthlyData = statsAny.monthly_commissions;
          
          this.commissionsTrendChartOptions.series = [{
            name: 'Comisiones',
            data: monthlyData.map((m: any) => m.amount)
          }];
          
          if (this.commissionsTrendChartOptions.xaxis) {
            this.commissionsTrendChartOptions.xaxis.categories = 
              monthlyData.map((m: any) => `${m.month}/${m.year}`);
          }
        }
      }
      
      // Actualizar distribución de ROI si existe ese gráfico
      if (this.roiDistributionChartOptions && this.roiDistributionChartOptions.series) {
        // Usar casting a any para evitar errores de tipado
        const statsAny = this.commissionerStats as any;
        
        // Verificar si tenemos datos de distribución de ROI
        if (statsAny.hasOwnProperty('roi_distribution') && 
            Array.isArray(statsAny.roi_distribution)) {
          this.roiDistributionChartOptions.series = statsAny.roi_distribution;
        }
      }
    } catch (error) {
      console.error('[CommissionerPanel] Error al actualizar las gráficas:', error);
      
      // Intentar recuperarse del error
      setTimeout(() => {
        console.log('[CommissionerPanel] Intentando recuperarse del error en gráficas');
        try {
          this.initCharts();
          this.cdr.detectChanges();
        } catch (recoverError) {
          console.error('[CommissionerPanel] No se pudo recuperar de error en gráficas:', recoverError);
        }
      }, 500);
    }
    
    // Forzar la detección de cambios con una serie de timeouts para garantizar renderizado
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 50);
    
    setTimeout(() => {
      this.cdr.detectChanges();
      
      // Verificar explícitamente el estado de los gráficos en el DOM
      const chartElements = document.querySelectorAll('.apexcharts-canvas');
      console.log(`[CommissionerPanel] Estado final: ${chartElements.length} elementos de gráficos encontrados`);
    }, 200);
  }
  
  private setupThemeObserver(): void {
    // Observar cambios en el tema (claro/oscuro)
    let themeChangeTimeout: any = null;
    
    const observer = new MutationObserver((mutations) => {
      // Evitamos múltiples actualizaciones consecutivas
      if (themeChangeTimeout) {
        clearTimeout(themeChangeTimeout);
      }
      
      themeChangeTimeout = setTimeout(() => {
        const isDark = document.documentElement.classList.contains('dark');
        
        // Actualizar tema una sola vez
        this.updateChartsTheme(isDark);
        
        // Actualizar gráficas con una secuencia optimizada
        // Primera actualización inmediata
        this.updateCharts();
        this.cdr.detectChanges();
        
        // Segunda actualización después de un breve retraso para asegurar que todos los cambios de tema
        // hayan sido procesados completamente por Angular
        setTimeout(() => {
          this.updateCharts();
          this.cdr.detectChanges();
        }, 200);
      }, 100);
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    // Configurar tema inicial
    const isDark = document.documentElement.classList.contains('dark');
    this.updateChartsTheme(isDark);
    
    // Limpieza del observer al destruir el componente
    this.destroy$.subscribe(() => {
      observer.disconnect();
    });
  }
  
  private updateChartsTheme(isDark: boolean): void {
    // Actualizar colores de los gráficos según el tema
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e5e7eb';
    const backgroundColor = 'transparent';
    
    // Actualizar el gráfico de distribución de clientes
    if (this.clientDistributionChartOptions) {
      // Actualizar leyenda
      if (this.clientDistributionChartOptions.legend) {
        this.clientDistributionChartOptions.legend.labels = {
          colors: textColor
        };
      }
      
      // Actualizar etiquetas
      if (this.clientDistributionChartOptions.dataLabels) {
        this.clientDistributionChartOptions.dataLabels.style = {
          colors: [textColor]
        };
      }
      
      // Aplicar tema
      this.clientDistributionChartOptions.chart = {
        ...this.clientDistributionChartOptions.chart,
        background: backgroundColor,
        foreColor: textColor
      };
      
      this.clientDistributionChartOptions.theme = {
        mode: isDark ? 'dark' : 'light'
      };
    }
    
    // Actualizar el gráfico de comisiones por mercado
    if (this.commissionsByMarketChartOptions) {
      // Actualizar ejes
      if (this.commissionsByMarketChartOptions.xaxis && this.commissionsByMarketChartOptions.xaxis.labels) {
        this.commissionsByMarketChartOptions.xaxis.labels.style = {
          colors: Array(10).fill(textColor) // Asegurar suficientes colores para todas las categorías
        };
      }
      
      if (this.commissionsByMarketChartOptions.yaxis && this.commissionsByMarketChartOptions.yaxis.title) {
        this.commissionsByMarketChartOptions.yaxis.title.style = {
          color: subtitleColor
        };
      }
      
      if (this.commissionsByMarketChartOptions.yaxis && this.commissionsByMarketChartOptions.yaxis.labels) {
        this.commissionsByMarketChartOptions.yaxis.labels.style = {
          colors: textColor
        };
      }
      
      // Actualizar grilla
      this.commissionsByMarketChartOptions.grid = {
        borderColor: gridColor,
        strokeDashArray: 4,
        yaxis: {
          lines: {
            show: true
          }
        }
      };
      
      // Aplicar tema
      this.commissionsByMarketChartOptions.chart = {
        ...this.commissionsByMarketChartOptions.chart,
        background: backgroundColor,
        foreColor: textColor
      };
      
      this.commissionsByMarketChartOptions.theme = {
        mode: isDark ? 'dark' : 'light'
      };
    }
    
    // Actualizar más gráficos aquí si se agregan en el futuro
    
    // Forzar actualización de los gráficos
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }
  
  // Helper para formatear fechas
  formatDate(date: Date | string): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  }
  
  // Helper para obtener clase de estado
  getStatusClass(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  }
  
  // Helper para obtener texto de estado internacionalizado
  getStatusText(status: string): string {
    switch (status) {
      case 'active':
        return $localize`:@@status.active:Activo`;
      case 'inactive':
        return $localize`:@@status.inactive:Inactivo`;
      case 'pending':
        return $localize`:@@status.pending:Pendiente`;
      default:
        return status;
    }
  }
  
  // Helper para formatear valores monetarios
  formatCurrency(value: number): string {
    return value?.toLocaleString('es-CO', { style: 'currency', currency: 'USD' }) || '$0';
  }
  
  // Helper para formatear porcentajes
  formatPercentage(value: number): string {
    return value?.toFixed(2) + '%' || '0%';
  }
  
  /**
   * Verifica si hay filtros activos actualmente
   * @returns booleano que indica si hay al menos un filtro activo
   */
  hasActiveFilters(): boolean {
    const filters = this.getFiltersFromForm();
    return !!(filters.client_name || filters.market || filters.status || 
              (filters.date_range?.start || filters.date_range?.end));
  }
  
  /**
   * Maneja el cambio de pestañas en el panel del comisionista
   * - Pestaña 0: Resumen (con gráficas)
   * - Pestaña 1: Clientes 
   * - Pestaña 2: Comisiones
   */
  onTabChange(event: any): void {
    const newTabIndex = event.index;
    const previousTabIndex = this.currentTabIndex;
    this.currentTabIndex = newTabIndex;
    
    console.log(`[CommissionerPanel] Tab changed from ${previousTabIndex} to ${newTabIndex}`);
    
    // Solo actualizamos las gráficas cuando cambiamos A la pestaña "Resumen" (índice 0)
    if (newTabIndex === 0 && previousTabIndex !== 0) {
      console.log('[CommissionerPanel] Entrando a la pestaña Resumen - iniciando carga de gráficas');
      
      // Reinicializar gráficas de forma completa y robusta
      this.reloadChartsForSummaryTab();
    } else if (newTabIndex === 0) {
      console.log('[CommissionerPanel] Ya estábamos en la pestaña Resumen - verificando estado de gráficas');
      
      // Si ya estamos en resumen, solo verificar que las gráficas estén presentes
      setTimeout(() => {
        const chartElements = document.querySelectorAll('.apexcharts-canvas');
        if (chartElements.length < 2) {
          console.log('[CommissionerPanel] Gráficas faltantes detectadas - recargando');
          this.reloadChartsForSummaryTab();
        }
      }, 100);
    }
  }

  /**
   * Método dedicado para recargar las gráficas de la pestaña de resumen
   * Este método implementa una estrategia robusta de recarga
   */
  private reloadChartsForSummaryTab(): void {
    console.log('[CommissionerPanel] INICIANDO RECARGA COMPLETA DE GRÁFICAS');
    
    // Paso 1: Limpiar cualquier instancia previa de ApexCharts
    this.clearExistingCharts();
    
    // Paso 2: Recargar datos desde el servidor
    this.loadData(true);
    
    // Paso 3: Secuencia de reinicialización de gráficas con reintentos
    const reinitializeCharts = () => {
      try {
        console.log('[CommissionerPanel] Reinicializando gráficas...');
        
        // Reinicializar completamente las opciones de gráficas
        this.initCharts();
        
        // Actualizar datos de las gráficas
        this.updateCharts();
        
        // Aplicar tema
        const isDark = document.documentElement.classList.contains('dark');
        this.updateChartsTheme(isDark);
        
        // Forzar detección de cambios
        this.cdr.detectChanges();
        
        console.log('[CommissionerPanel] Reinicialización de gráficas completada');
      } catch (error) {
        console.error('[CommissionerPanel] Error en reinicialización de gráficas:', error);
      }
    };
    
    // Ejecutar reinicialización en múltiples momentos para garantizar éxito
    setTimeout(() => reinitializeCharts(), 100);
    setTimeout(() => reinitializeCharts(), 300);
    setTimeout(() => reinitializeCharts(), 600);
    
    // Verificación final
    setTimeout(() => {
      const chartElements = document.querySelectorAll('.apexcharts-canvas');
      console.log(`[CommissionerPanel] Verificación final: ${chartElements.length} gráficas encontradas`);
      
      if (chartElements.length < 2) {
        console.log('[CommissionerPanel] ÚLTIMA OPORTUNIDAD - Intento final de carga');
        reinitializeCharts();
      } else {
        console.log('[CommissionerPanel] ✅ Gráficas cargadas correctamente');
      }
    }, 1000);
  }

  /**
   * Limpia todas las instancias existentes de ApexCharts
   */
  private clearExistingCharts(): void {
    try {
      console.log('[CommissionerPanel] Limpiando instancias existentes de gráficas');
      
      // Destruir instancias de ApexCharts si existen
      const chartElements = document.querySelectorAll('.apexcharts-canvas');
      chartElements.forEach((element: any) => {
        try {
          if (element.id && window.ApexCharts) {
            const chartId = element.id.replace('apexcharts', '');
            const chart = window.ApexCharts.getChartByID(chartId);
            if (chart) {
              chart.destroy();
              console.log(`[CommissionerPanel] Gráfica destruida: ${chartId}`);
            }
          }
        } catch (destroyError) {
          console.warn('[CommissionerPanel] Error destruyendo gráfica:', destroyError);
        }
      });
      
      // Limpiar contenedores de gráficas
      const chartContainers = document.querySelectorAll('.chart-container');
      chartContainers.forEach((container: any) => {
        if (container) {
          container.innerHTML = '';
          console.log('[CommissionerPanel] Contenedor de gráfica limpiado');
        }
      });
      
    } catch (error) {
      console.error('[CommissionerPanel] Error limpiando gráficas:', error);
    }
  }
  
  /**
   * Abre el diálogo para seleccionar acciones para comprar o vender para un cliente
   * @param client El cliente para el que se realizará la operación
   * @param action La acción a realizar ('buy' o 'sell')
   */
  openTradeDialog(client: CommissionerClient, action: 'buy' | 'sell'): void {
    // Importar directamente el componente
    import('../shared/modals/stock-selection-dialog/stock-selection-dialog.component').then(module => {
      // Obtener el componente exportado
      const StockSelectionDialogComponent = (module as any).StockSelectionDialogComponent;
      
      // Crear configuración del diálogo con los mismos estilos que los otros modales
      const dialogConfig = new MatDialogConfig();
      dialogConfig.width = '550px';
      dialogConfig.maxHeight = '90vh';
      dialogConfig.disableClose = false; // Permitir cerrar al hacer clic fuera
      dialogConfig.autoFocus = false;
      dialogConfig.panelClass = 'custom-dialog-container';
      dialogConfig.data = {
        action: action,
        clientId: client.id,
        clientName: client.name
      };
      
      // Abrir el diálogo
      const dialogRef = this.dialog.open(StockSelectionDialogComponent, dialogConfig);

        // Suscribirse al resultado cuando el usuario cierra el diálogo
        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            // Si el usuario seleccionó una acción, procedemos con la operación
            this.handleStockSelection(result, client, action);
          }
        });
      });
  }

  private handleStockSelection(result: any, client: CommissionerClient, action: 'buy' | 'sell'): void {
    const stock = result.stock;
    
    // Importar dinámicamente los componentes necesarios
    if (action === 'buy') {
      import('../shared/modals/buy-stock-modal/buy-stock-modal.component')
        .then(({ BuyStockModalComponent }) => {
          // Abrir el modal de compra
          const dialogRef = this.dialog.open(BuyStockModalComponent, {
            width: '500px',
            maxHeight: '90vh',
            data: { 
              stock: {
                symbol: stock.symbol,
                name: stock.name,
                exchange: stock.exchange || '',
                type: '',
                currency: 'USD',
                current_price: stock.current_price || 0,
                unitValue: stock.current_price || 0
              },
              price: stock.current_price || 0,
              clientId: client.id
            },
            panelClass: 'custom-dialog-container',
            autoFocus: false
          });

          dialogRef.afterClosed().subscribe(buyResult => {
            if (buyResult && buyResult.success) {
              this.snackBar.open(`Orden de compra procesada exitosamente para ${client.name}.`, 'Aceptar', { duration: 3000 });
              // Recargar datos
              this.loadData(true);
            }
          });
        });
    } else if (action === 'sell') {
      import('../shared/modals/sell-stock-modal/sell-stock-modal.component')
        .then(({ SellStockModalComponent }) => {
          // Abrir el modal de venta
          const dialogRef = this.dialog.open(SellStockModalComponent, {
            width: '500px',
            maxHeight: '90vh',
            data: { 
              stock: {
                symbol: stock.symbol,
                name: stock.name,
                exchange: stock.exchange || '',
                type: '',
                currency: 'USD',
                current_price: stock.current_price || 0,
                unitValue: stock.current_price || 0
              },
              price: stock.current_price || 0,
              clientId: client.id
            },
            panelClass: 'custom-dialog-container',
            autoFocus: false
          });

          dialogRef.afterClosed().subscribe(sellResult => {
            if (sellResult && sellResult.success) {
              this.snackBar.open(`Orden de venta procesada exitosamente para ${client.name}.`, 'Aceptar', { duration: 3000 });
              // Recargar datos
              this.loadData(true);
            }
          });
        });
    }
  }
  
  /**
   * Retorna un objeto de estadísticas vacío pero con la estructura correcta
   * Útil cuando no hay datos reales disponibles pero necesitamos inicializar gráficos
   */
  private getEmptyStatistics(): CommissionerStats {
    // Creamos un objeto con estructura básica y lo forzamos a CommissionerStats
    // Primero convertimos a unknown y luego a CommissionerStats para evitar errores TypeScript
    const emptyStats = {
      total_clients: 0,
      active_clients: 0,
      clients_with_negative_roi: 0,
      total_commissions_month: 0,
      total_commissions_year: 0,
      commission_growth: 0,
      average_roi_clients: 0,
      totalOperations: 0,
      total_investments_managed: 0,
      top_performing_clients: [],
      commissions_by_market: [
        { market: 'US', amount: 0 },
        { market: 'LATAM', amount: 0 },
        { market: 'EU', amount: 0 },
      ]
    };
    
    return emptyStats as unknown as CommissionerStats;
  }
}
