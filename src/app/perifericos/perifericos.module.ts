import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { PerifericosPage } from './perifericos.page';
import { PerifericosPageRoutingModule } from './perifericos-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PerifericosPageRoutingModule],
  declarations: [PerifericosPage],
})
export class PerifericosPageModule {}
